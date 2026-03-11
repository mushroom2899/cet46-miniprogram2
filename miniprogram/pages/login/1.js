// pages/wordLearn/wordLearn.js顺序抽单词答错完善版本
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    // 基础 UI 数据
    navBarHeight: 0,
    menuTop: 0,
    menuHeight: 0,

    // 核心算法与队列状态 
    batchSize: 5,        // 每次学习的单词总数（默认 5个）
    completedInBatch: 0, // 本组已经完成学习的单词数（答对即算完成）
    currentPhase: 1,     // 当前处于第几轮循环（1, 2, 3）
    sessionWords: [],    // 本组 5 个单词的完整数据池
    activeQueue: [],     // 当前屏幕上正在轮换的单词索引（最多3个）
    pendingQueue: [],    // 休息区：已答对、等待后续轮次复习的单词索引
    currentIndex: -1,    // 当前正在展示的单词在 sessionWords 中的索引
    
    currentWord: null,   // 当前展示的单词对象
    options: [],         // 选项列表
    batchDistractors: [],// 干扰项缓存池（优化性能，不用每次都查库）

    progressId: '',
    category: '',
    isAnswered: false,   
    selectedIndex: -1,   
    accentType: 2,       
    isLoading: true
  },

  onLoad(options) {
    this.initNavBar();
    this.audioCtx = wx.createInnerAudioContext();
    this.audioCtx.onError((res) => console.error('播放失败:', res.errMsg));

    //读取用户在个人中心的设置！
    // 从缓存中拿到用户设定的每组学习量，如果没有设置过，就默认 5 个
    const customBatchSize = wx.getStorageSync('learnCount') || 5;
    // 读取用户偏好的发音类型（2美式，1英式）
    const customAccentType = wx.getStorageSync('accentType') || 2;
    
    // 将拿到的数量，直接覆盖掉引擎里的 batchSize 变量！
    this.setData({
      batchSize: customBatchSize,
      accentType: customAccentType // 使用此发音和音标展示
    });

    if (options.progressId && options.category) {
      this.setData({ 
        progressId: options.progressId,
        category: options.category 
      });
      // 检查是否有未完成的缓存进度
      this.checkSession();
    }
  },

  onShow() {
    const shouldLoadNext = wx.getStorageSync('shouldLoadNextWord');
    if (shouldLoadNext) {
      wx.removeStorageSync('shouldLoadNextWord');
      this.loadNextWord(); 
    }
  },

  onUnload() {
    if (this.audioCtx) this.audioCtx.destroy();
  },

  /**
   * 检查本地是否有进行到一半的单词组
   */
  async checkSession() {
    const session = wx.getStorageSync('learningSession');
    if (session && session.progressId === this.data.progressId) {
      delete session.accentType; 
      delete session.batchSize;  
      this.setData(session);
      this.loadNextWord();
    } else {
      this.initNewBatch();
    }
  },

  /**
   * 加载全新的一组单词（默认5个）
   */
  async initNewBatch() {
    this.setData({ isLoading: true });
    wx.showLoading({ title: '加载单词组...', mask: true });

    try {
      const progressRes = await db.collection('user_progress').doc(this.data.progressId).get();
      const learnedCount = progressRes.data.learnedCount || 0;
      const totalWords = progressRes.data.totalWords;

      // 1. 获取本组的 5 个单词
      const wordRes = await db.collection(this.data.category)
        .orderBy('wordRank', 'asc')
        .skip(learnedCount)
        .limit(this.data.batchSize)
        .get();

      if (wordRes.data.length === 0) {
        wx.hideLoading();
        wx.showModal({ title: '恭喜', content: '您已学完本书所有单词！', showCancel: false, success:()=> wx.navigateBack() });
        return;
      }

      // 2. 性能优化：一次性获取 20 个随机词作为干扰项池，避免每次点击选项都去查数据库造成卡顿
      const distractorsRes = await db.collection(this.data.category)
        .skip(Math.floor(Math.random() * (totalWords - 20)))
        .limit(20)
        .get();

      // 给每个单词增加一个 step 属性（仅用于UI展示进度点，无业务逻辑）
      const sessionWords = wordRes.data.map(w => {
        w.step = 0;
        return w;
      });
      const actualBatchSize = sessionWords.length;

      // 初始化第一轮循环的队列：把所有词的序号放入 pending
      let pendingQueue = sessionWords.map((_, i) => i);
      // 先拿前 3 个进入活跃队列
      let activeQueue = pendingQueue.splice(0, Math.min(3, actualBatchSize));

      this.setData({
        sessionWords,
        batchSize: actualBatchSize,
        completedInBatch: 0,
        currentPhase: 1,
        activeQueue,
        pendingQueue,
        batchDistractors: distractorsRes.data
      });

      // 存入缓存
      wx.setStorageSync('learningSession', this.data);
      wx.hideLoading();
      this.loadNextWord();

    } catch (err) {
      wx.hideLoading();
      console.error("加载失败", err);
    }
  },

  /**
   * 从内存队列中提取下一个单词
   */
  async loadNextWord() {
    let { currentPhase, sessionWords, activeQueue, pendingQueue, batchSize, completedInBatch } = this.data;

    // 如果当前活跃队列空了
    if (activeQueue.length === 0) {
      // 如果等待队列也空了，说明这一轮（Phase）彻底学完了！
      if (pendingQueue.length === 0) {
        currentPhase++; // 进入下一轮
        
        // 如果 3 轮全部学完，处理数据库保存
        if (currentPhase > 3) {
          await this.finishBatch();
          return;
        } else {
          // 初始化下一轮的队列：所有单词重新进入休息区
          pendingQueue = sessionWords.map((_, i) => i);
          activeQueue = pendingQueue.splice(0, Math.min(3, batchSize));
        }
      } else {
        // 兜底补齐活跃队列
        activeQueue = pendingQueue.splice(0, Math.min(3, pendingQueue.length));
      }
    }

    // 从队列头部取出一个单词来展示
    let nextIdx = activeQueue.shift(); 
    let target = sessionWords[nextIdx];

    // 重置页面状态
    this.setData({
      currentWord: target,
      currentIndex: nextIdx,
      currentPhase,
      activeQueue,
      pendingQueue,
      isAnswered: false,
      selectedIndex: -1,
      isLoading: false
    });

    // 从缓存池里随机挑 3 个干扰项
    let shuffledDistractors = this.data.batchDistractors.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    this.generateOptions(target, shuffledDistractors);

    this.playAudio();
  },

  generateOptions(target, distractors) {
    const correctTrans = target.content.word.content.trans[0];
    const correct = { pos: correctTrans.pos, trans: correctTrans.tranCn, isCorrect: true };

    const wrongs = distractors.map(d => {
      const t = d.content.word.content.trans[0];
      return { pos: t.pos, trans: t.tranCn, isCorrect: false };
    });

    const allOptions = [correct].concat(wrongs).sort(() => Math.random() - 0.5);
    this.setData({ options: allOptions });
  },

  /**
   * 处理答题对错与队列进出逻辑（核心修改点）
   */
  processAnswer(isCorrect) {
    let { currentIndex, sessionWords, activeQueue, pendingQueue, completedInBatch } = this.data;
    let updateData = {}; 

    if (isCorrect) {
      // 1. 答对：进度+1（仅UI展示），标记为完成，放入休息区队尾
      sessionWords[currentIndex].step = 1; // 仅用于UI绿点展示
      completedInBatch++;
      pendingQueue.push(currentIndex); // 踢去休息区队尾

      // 2. 从休息区头部拉一个新词补充到活跃区
      if (pendingQueue.length > 0) {
        activeQueue.push(pendingQueue.shift());
      }
    } else {
      // 1. 答错：进度清零，放回活跃区队尾（不进休息区）
      sessionWords[currentIndex].step = 0;
      activeQueue.push(currentIndex); // 活跃区队尾，短时间内重考
    }

    // 2. 批量更新状态
    updateData.sessionWords = sessionWords;
    updateData.activeQueue = activeQueue;
    updateData.pendingQueue = pendingQueue;
    updateData.completedInBatch = completedInBatch;
    updateData['currentWord.step'] = sessionWords[currentIndex].step;

    // 3. 推送到视图
    this.setData(updateData);
    
    wx.setStorageSync('learningSession', this.data);
  },

  async onOptionTap(e) {
    if (this.data.isAnswered) return;
    const isCorrect = e.currentTarget.dataset.correct;
    const index = e.currentTarget.dataset.index;

    this.setData({ isAnswered: true, selectedIndex: index });
    this.processAnswer(isCorrect); // 驱动队列引擎

    if (isCorrect) {
      setTimeout(() => this.goToWordDetail(true), 800);
    } else {
      // 答错仅清空进度，无其他操作（单词已放回活跃区队尾）
      sessionWords[currentIndex].step = 0;
      this.setData({
        sessionWords: sessionWords,
        currentWord: sessionWords[currentIndex]
      });
    }
  },

  onBottomBtnTap() {
    if (this.data.isAnswered) {
      this.goToWordDetail(false);
    } else {
      this.setData({ isAnswered: true, selectedIndex: -1 });
      this.processAnswer(false); // 直接看答案算作答错
    }
  },

  goToWordDetail(isCorrect = false) {
    const targetWord = this.data.sessionWords[this.data.currentIndex];
    wx.setStorageSync('currentWordDetail', targetWord);
    
    // 把当前组进度，和【这个词当下的学习步骤】传过去渲染点点
    wx.navigateTo({
        url: `/pages/wordDetail/wordDetail?completedInBatch=${this.data.completedInBatch}&batchSize=${this.data.batchSize}&isCorrect=${isCorrect}&currentStep=${targetWord.step}`
    });
  },

  /**
   * 本组彻底学完，结算写入数据库
   */
  async finishBatch() {
    wx.showLoading({ title: '保存进度中...' });
    const { progressId, batchSize } = this.data;
    try {
      // 真实进度更新：学习量加5，需要复习的单词加5
      await db.collection('user_progress').doc(progressId).update({
        data: {
          learnedCount: _.inc(batchSize),
          reviewCount: _.inc(batchSize)
        }
      });
      wx.removeStorageSync('learningSession'); // 清除本组缓存
      wx.hideLoading();
      wx.showToast({ title: '本组完成！', icon: 'success' });
      
      // 无缝拉取下一组 5 个词
      setTimeout(() => {
        this.initNewBatch();
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      console.error("保存失败", err);
      wx.showToast({ title: '网络异常进度未保存', icon: 'none' });
    }
  },

  toggleAccent() {
    const newType = this.data.accentType === 2 ? 1 : 2;
    this.setData({ accentType: newType });
    this.playAudio();
  },
  
  playAudio() {
    if (!this.data.currentWord) return;
    const word = this.data.currentWord.headWord;
    const type = this.data.accentType; 
    this.audioCtx.src = `https://dict.youdao.com/dictvoice?audio=${word}&type=${type}`;
    this.audioCtx.play();
  },
  
  initNavBar() {
    const sys = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.setData({
      navBarHeight: sys.statusBarHeight + menu.height + (menu.top - sys.statusBarHeight) * 2,
      menuTop: menu.top,
      menuHeight: menu.height
    });
  },
  
  goBack() { wx.navigateBack(); }
});