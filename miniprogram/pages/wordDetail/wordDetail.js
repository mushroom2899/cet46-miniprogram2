Page({
    data: {
      navBarHeight: 0,
      menuTop: 0,
      menuHeight: 0,
      word: null, // 当前解析的单词对象         
      completedInBatch: 0, // 本组已经完成 3 次学习的单词数
      batchSize: 5,        // 每次学习的单词总数
      currentStep: 0,      // 该单词目前完成了几遍
      accentType: 2,     // 发音类型：2 为美音，1 为英音  
      isExpandOpen: false,  // 拓展词汇是否展开
      isCorrect: false, // 是否答对
      showThumb: false  // 是否显示点赞图标
    },
  
    onLoad(options) {
      this.initNavBar();
  
      // 1. 接收从 wordLearn 传来的最新组进度数据
      if (options.completedInBatch && options.batchSize) {
        this.setData({
          completedInBatch: options.completedInBatch,
          batchSize: options.batchSize
        });
      }
  
      // 2. 接收当前单词的学习深度 (1,2,3)
      if (options.currentStep) {
        this.setData({ currentStep: parseInt(options.currentStep) });
      }
  
      // 3. 判断是否答对并显示赞
      if (options.isCorrect === 'true') {
        this.setData({ isCorrect: true, showThumb: true });
        setTimeout(() => {
          this.setData({ showThumb: false });
        }, 2000);
      } 
  
      const currentWordDetail = wx.getStorageSync('currentWordDetail');
      if (currentWordDetail) {
        this.setData({ word: currentWordDetail });
      }
      
      // 初始化发音组件
      this.audioCtx = wx.createInnerAudioContext();
      this.audioCtx.onError((res) => console.error('播放失败:', res.errMsg));
      // 页面加载后自动播放一遍发音
      this.playAudio();
    },
  
    onUnload() { if (this.audioCtx) this.audioCtx.destroy(); },
  
    /**
     * 切换发音类型
     */
    toggleAccent() {
      const newType = this.data.accentType === 2 ? 1 : 2;
      this.setData({ accentType: newType });
      this.playAudio(); 
    },

    /**
     * 播放发音
     */
    playAudio() {
      if (!this.data.word) return;
      const spell = this.data.word.headWord;
      const type = this.data.accentType;
      this.audioCtx.src = `https://dict.youdao.com/dictvoice?audio=${spell}&type=${type}`;
      this.audioCtx.play();
    },

    /**
     * 展开/收起 拓展词汇
     */
    toggleExpand() { this.setData({ isExpandOpen: !this.data.isExpandOpen }); },

    /**
     * 返回上一页
     */
    goBack() { wx.navigateBack({ delta: 2 }); },

    /**
     * 点击“下一个”按钮
     */
    goNext() {
      wx.setStorageSync('shouldLoadNextWord', true);
      wx.navigateBack({ delta: 1 });
    },

     /**
     * 初始化导航栏高度
     */
    initNavBar() {
      const sys = wx.getSystemInfoSync();
      const menu = wx.getMenuButtonBoundingClientRect();
      this.setData({
        navBarHeight: sys.statusBarHeight + menu.height + (menu.top - sys.statusBarHeight) * 2,
        menuTop: menu.top,
        menuHeight: menu.height
      });
    }
  });