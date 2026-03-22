// pages/wordReview/wordReview.js
const db = wx.cloud.database(); // 引入云数据库

Page({
  data: {
    inputValue: '',
    isFocus: false,
    keyboardHeight: 0,
    
    // 核心业务数据
    category: 'CET4', // 当前复习的词书类型，默认兜底为 CET4
    targetReviewCount: 10, // 默认复习量，会从个人中心读取
    reviewWords: [],  // 需要复习的单词列表
    currentIndex: 0,  // 当前复习到第几个
    currentWord: null,// 当前正在复习的单词对象
    isCorrect: false,  // 当前输入是否正确
    showAnswer: false,
    // 发音与音标控制状态
    showPhonetic: false, // 是否显示音标
    accentType: 2        // 发音类型：2为美音，1为英音
  },

  // onLoad 中接收 options 参数
  onLoad(options) {
    // 1. 监听键盘高度变化
    wx.onKeyboardHeightChange(res => {
      this.setData({ keyboardHeight: res.height });
    });

    // === 【动态获取词书类型】 ===
    // 逻辑：优先尝试从上个页面传递的 options 取 -> 其次从本地缓存取 -> 最后兜底用 'CET4'
    const currentCategory = options.category || wx.getStorageSync('currentCategory') || 'CET4';
    
    // 2. 读取个人中心设置的复习量 (如果没设置过，兜底默认 10 个)
    const savedReviewCount = wx.getStorageSync('reviewCount') || 5;

    const savedAccentType = wx.getStorageSync('accentType') || 2;
    
    // 将读取到的分类和复习量存入 data
    this.setData({ 
      category: currentCategory,
      targetReviewCount: savedReviewCount ,
      accentType: savedAccentType
    });

    // 初始化发音组件
    this.audioCtx = wx.createInnerAudioContext();
    this.audioCtx.onError((res) => console.error('播放失败:', res.errMsg));
    // 3. 页面加载时拉取复习数据
    this.fetchReviewWords(savedReviewCount);
  },

  // 页面卸载时销毁音频组件，防止内存泄漏
  onUnload() {
    if (this.audioCtx) {
      this.audioCtx.destroy();
    }
  },

  // === 从云数据库拉取真实单词 ===
  async fetchReviewWords(limitCount) {
    wx.showLoading({ title: '加载已学词库...' });
    try {
      // 【重点修改】去 user_words（已学词库）里抽词，而不是去总库抽
      const res = await db.collection('user_words')
        .aggregate()
        .match({ 
          category: this.data.category // 只抽出当前所选词书的已学单词
        }) 
        .sample({ size: limitCount })  // 随机抽取用户设定数量的单词
        .end();
  
      // 因为我们在学习时把单词的完整数据包存在了 wordData 字段里，这里要把它们“剥”出来
      const words = res.list.map(item => item.wordData);
  
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
          content: '你还没有学习过这本词书的单词哦，先去学习几个再来复习吧！',
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
        content: `恭喜你完成了本组 ${this.data.targetReviewCount} 个单词的听写复习！`,
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
  checkAnswer() {
    if (this.data.isCorrect) {
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
  }
});