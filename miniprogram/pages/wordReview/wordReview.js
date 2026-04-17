// pages/wordReview/wordReview.js
const db = wx.cloud.database(); // 引入云数据库
const _ = db.command;

// 掌握度计算工具函数
const calculateMastery = (testCount, correctCount, reviewedCount = 0) => {
  if (!testCount || testCount === 0) return 0;
  const accuracy = correctCount / testCount;
  const reviewScore = Math.min(reviewedCount, 5) / 5;
  return Math.round((accuracy * 0.6 + reviewScore * 0.4) * 100);
};

Page({
  data: {
    inputValue: '',
    isFocus: false,
    keyboardHeight: 0,
    
    // 核心业务数据
    progressId: '',
    category: 'CET4', // 当前复习的词书类型，默认兜底为 CET4
    targetReviewCount: 5, // 默认复习量，会从个人中心读取
    reviewWords: [],  // 需要复习的单词列表
    currentIndex: 0,  // 当前复习到第几个
    currentWord: null,// 当前正在复习的单词对象
    isCorrect: false,  // 当前输入是否正确
    showAnswer: false,
    // 发音与音标控制状态
    showPhonetic: false, // 是否显示音标
    accentType: 2,        // 发音类型：2为美音，1为英音
    isUpdating: false // 状态锁，防止并发引起的计算错误
  },

  // onLoad 中接收 options 参数
  onLoad(options) {
    // 1. 监听键盘高度变化
    wx.onKeyboardHeightChange(res => {
      this.setData({ keyboardHeight: res.height });
    });

    // === 【动态获取词书类型】 ===
    // 逻辑：优先尝试从上个页面传递的 options 取 -> 其次从本地缓存取 
    const currentCategory = options.category || wx.getStorageSync('currentCategory') || 'CET4';
    
    // 2. 读取个人中心设置的复习量
    const savedReviewCount = wx.getStorageSync('reviewCount') || 5;

    const savedAccentType = wx.getStorageSync('accentType') || 2;
    
    // 将读取到的分类和复习量存入 data
    this.setData({ 
      category: currentCategory,
      targetReviewCount: savedReviewCount ,
      progressId: options.progressId,
      accentType: savedAccentType
    });

    // 初始化发音组件
    this.audioCtx = wx.createInnerAudioContext();
    this.audioCtx.onError((res) => console.error('播放失败:', res.errMsg));
    // 3. 页面加载时拉取复习数据
    this.fetchReviewWords(savedReviewCount, currentCategory);
  },

  // 页面卸载时销毁音频组件，防止内存泄漏
onUnload() {
  // 安全销毁音频实例
  // 只有当 this.audioCtx 存在时，才执行 destroy()
  if (this.audioCtx) {
    try {
      this.audioCtx.destroy();
      console.log('音频实例已安全销毁');
    } catch (e) {
      console.error('音频销毁异常:', e);
    }
  }
},

  // === 从云数据库拉取真实单词 ===
  async fetchReviewWords(limitCount, category) {
    wx.showLoading({ title: '加载已学词库...' });
   
    try {
      const res = await db.collection('user_words')
      .where({ category: category || this.data.category })
      .orderBy('mastery', 'asc') // 掌握度越低越靠前
      .limit(limitCount)
      .get();

    const words = res.data.map(item => ({
      ...item.wordData,
      _dbId: item._id,
      mastery: item.mastery || 0,
      reviewedCount: item.reviewedCount || 0,
      testCount: item.testCount || 0,
      correctCount: item.correctCount || 0
    }));

      if (words && words.length > 0) {
        this.setData({
          reviewWords: words,
          currentIndex: 0,
          currentWord: words[0],
          isFocus: true // 自动弹起键盘
        });
      } else {
        wx.showModal({
          title: '提示',
          content: '暂无已学单词，先去学习吧！',
          showCancel: false,
          success: () => wx.navigateBack()
        });
      }
    } catch (err) {
      console.error("拉取复习单词失败", err);
      wx.showToast({ title: '获取数据失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  focusInput() {
    this.setData({ isFocus: true });
  },

  // === 监听输入并校验 ===
  onInput(e) {
    const userInput = e.detail.value.trim().toLowerCase(); // 转小写去除空格
    const targetWord = this.data.currentWord.headWord.toLowerCase();
    
    this.setData({ 
      inputValue: e.detail.value,
      isCorrect: userInput === targetWord
    });

    if (userInput === targetWord) {
      this.handleCorrect();
    }
  },

  // === 拼写正确的处理逻辑 ===
  handleCorrect() {
    // 显示音标
    this.setData({ showPhonetic: true });
  
    // 播放纯正发音，给予正反馈
    const targetWord = this.data.currentWord.headWord;
    const type = this.data.accentType; 
    this.audioCtx.src = `https://dict.youdao.com/dictvoice?audio=${targetWord}&type=${type}`;
    this.audioCtx.play();
  },

  // === 切换下一个单词 ===
  nextWord() {
    let nextIdx = this.data.currentIndex + 1;
    
    if (nextIdx < this.data.reviewWords.length) {
      this.setData({
        currentIndex: nextIdx,
        currentWord: this.data.reviewWords[nextIdx],
        inputValue: '',    
        isCorrect: false, 
        showPhonetic: false, 
        showAnswer: false,
        isFocus: true      
      });
    } else {
      wx.showModal({
        title: '太棒了',
        content: `恭喜你完成了本组 ${this.data.targetReviewCount} 个单词的复习！`,
        showCancel: false,
        confirmText: '返回',
        confirmColor: '#FF6B00',
        success: () => {
          wx.navigateBack(); 
        }
      });
    }
  },

  // === 点击💡提示首字母 ===
  showHint() {
    const target = this.data.currentWord.headWord;
    const currentLen = this.data.inputValue.length;
    const hintText = target.substring(0, currentLen + 1);
    this.setData({ inputValue: hintText });
  },

  // 点击灯泡显示音标并播放声音
  playHint() {
    if (!this.data.currentWord) return;
    
    // 显示音标
    this.setData({ showPhonetic: true });

    // 播放声音
    const spell = this.data.currentWord.headWord;
    const type = this.data.accentType; 
    this.audioCtx.src = `https://dict.youdao.com/dictvoice?audio=${spell}&type=${type}`;
    this.audioCtx.play();
  },

  goBack() { wx.navigateBack({ delta: 1 }); },

  // === 点击×跳过单词 ===
  skipWord() {
    const targetWord = this.data.currentWord.headWord;
    wx.showToast({ title: `答案: ${targetWord}`, icon: 'none', duration: 1500 });
    
    this.setData({ inputValue: targetWord, isCorrect: true });
    
    setTimeout(() => {
      this.nextWord();
    }, 1500);
  },

  // === 手动点击✓号验证 ===
 async checkAnswer() {
    if (this.data.isUpdating) return;

    if (this.data.isCorrect) {
      await this.updateReviewCount();
      this.nextWord();
    } else {
      const targetWord = this.data.currentWord.headWord;
      const type = this.data.accentType; 
  
      this.setData({ 
        showAnswer: true,   
        showPhonetic: true  
      });
  
      this.audioCtx.src = `https://dict.youdao.com/dictvoice?audio=${targetWord}&type=${type}`;
      this.audioCtx.play();
  
      if (this.phoneticTimer) clearTimeout(this.phoneticTimer);
  
      wx.showToast({ title: '已显示正确拼写', icon: 'none', duration: 1500 });
  
      setTimeout(() => {
        this.nextWord();
      }, 2000);
    }
  },

  // async updateReviewCount() {

  //   const { currentWord, progressId } = this.data;// 【新增调试日志】
  //   console.log('--- 算分现场抓包 ---');
  //   console.log('this.data:', this.data);
  //   console.log('currentWord:', currentWord);
  //   console.log('单词:', currentWord.headWord);
  //   console.log('数据库原始复习次数:', currentWord.reviewedCount);

  //   if (!currentWord || !currentWord._dbId) return;
  //   console.log(this.data);
  
  //   try {
  //     // 1. 计算最新的掌握度分值
  //     const newReviewedCount = (currentWord.reviewedCount || 0) + 1;
  //     console.log('参与计算的复习次数(newReviewedCount):', newReviewedCount);
  //     const newMastery = calculateMastery(currentWord.testCount, currentWord.correctCount, newReviewedCount);
      

  //   console.log('最终算出的掌握度:', newMastery);
  
  //     const tasks = [];
  
  //     // 任务 A: 更新单词表（掌握度、复习次数、最后复习时间）
  //     tasks.push(
  //       db.collection('user_words').doc(currentWord._dbId).update({
  //         data: { 
  //           reviewedCount: _.inc(1), 
  //           mastery: newMastery, 
  //           lastReviewDate: db.serverDate(),

  //         'wordData.reviewedCount': newReviewedCount,
  //         'wordData.testCount': currentWord.testCount,
  //         'wordData.correctCount': currentWord.correctCount
  //         }
  //       })
  //     );
  
  //     // 任务 B: 更新进度表（总复习数+1，待复习任务-1）
  //     if (progressId) {
  //       tasks.push(
  //         db.collection('user_progress').doc(progressId).update({
  //           data: { 
  //             reviewCount: _.inc(1),  // 已经完成复习字段自增 1
  //             reviewNumber: _.inc(-1) // 需要复习字段自减 1 
  //           }
  //         })
  //       );
  //     }
  
  //     await Promise.all(tasks);
  
  //     // 同步本地数据，确保后续逻辑正常
  //     this.setData({ 
  //       'currentWord.reviewedCount': newReviewedCount, 
  //       'currentWord.mastery': newMastery ,
  //       'currentWord.wordData.reviewedCount': newReviewedCount // 同时也同步本地的内层
  //     });
  
  //     console.log('掌握度与任务进度同步更新成功');
  //   } catch (err) {
  //     this.setData({ isUpdating: false }); // 失败了才解锁
  //     console.error('更新失败:', err);
  //   }
  // }

  async updateReviewCount() {
    const { currentWord, progressId, currentIndex, reviewWords } = this.data;
    if (!currentWord || !currentWord._dbId || this.data.isUpdating) return;

    this.setData({ isUpdating: true });

    try {
      // 1. 基于当前单词的原始数据计算（不再受全局 currentWord 污染）
      const oldVal = currentWord.reviewedCount || 0;
      const newVal = oldVal + 1;
      
      const newMastery = calculateMastery(
        currentWord.testCount, 
        currentWord.correctCount, 
        newVal
      );

      console.log(`[更新中] ${currentWord.headWord}: ${oldVal} -> ${newVal}, 掌握度: ${newMastery}`);

      const tasks = [];
      // 任务 A: 更新单词表
      tasks.push(
        db.collection('user_words').doc(currentWord._dbId).update({
          data: { 
            reviewedCount: _.inc(1), 
            mastery: newMastery, 
            lastReviewDate: db.serverDate(),
            'wordData.reviewedCount': newVal // 同步内部备份
          }
        })
      );

      // 任务 B: 更新进度表
      if (progressId) {
        tasks.push(
          db.collection('user_progress').doc(progressId).update({
            data: { 
              reviewedNumber: _.inc(1),
              reviewNumber: _.inc(-1)
            }
          })
        );
      }

      await Promise.all(tasks);

      // 2. 核心修正：手动更新本地数组中对应的那个单词，防止 nextWord 拿到脏数据
      const updatedWords = [...reviewWords];
      updatedWords[currentIndex].reviewedCount = newVal;
      updatedWords[currentIndex].mastery = newMastery;

      this.setData({ 
        reviewWords: updatedWords,
        isUpdating: false 
      });

    } catch (err) {
      console.error('更新失败:', err);
      this.setData({ isUpdating: false });
    }
  },

});