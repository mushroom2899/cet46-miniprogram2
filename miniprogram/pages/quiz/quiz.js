// pages/quiz/quiz.js
Page({
    data: {
      // 默认激活的模块标签
      activeTab: 'reading', 
      
      predictScore: 60,
      activeYear: '2025',
  
      // ======== 听力模块进度数据 ========
      shortNewsProgress: 10, shortNewsTotal: 3936,
      longDialogProgress: 0, longDialogTotal: 3185,
      passageProgress: 0, passageTotal: 5443,
      
      // ======== 阅读模块进度数据 ========
      fillBlankProgress: 0, fillBlankTotal: 1200,          // 选词填空
      matchingProgress: 0, matchingTotal: 1500,            // 信息匹配
      carefulReadingProgress: 0, carefulReadingTotal: 1800,// 仔细阅读
      
      // ======== 写译模块进度数据 ========
      write: 0, writeTotal: 1627,               // 写作
      translate: 0, translateTotal: 2734,       // 翻译
      
      // ======== 单词模块进度数据 ========
      readingWordsProgress: 0, readingWordsTotal: 965,    // 阅读单词
      listeningWordsProgress: 0, listeningWordsTotal: 1020,// 听力单词

      listeningProgress: 0,
      listeningTotal: 2730,
      readingProgress: 0,
      readingTotal: 4535,
      writingProgress: 0,
      writingTotal: 106,
      translationProgress: 0,
      translationTotal: 109,
  
      // 试卷 Mock 数据
      papers: [
        { id: 1, title: '12月试卷三', submitCount: 0 },
        { id: 2, title: '12月试卷二', submitCount: 0 },
        { id: 3, title: '12月试卷一', submitCount: 0 },
        { id: 4, title: '1206四级模考', submitCount: 5770 }
      ]
    },
  
    onLoad(options) {
      this.loadProgressData();
    },
  
    loadProgressData() {
      // 示例：从本地缓存读取进度，如果没有则设为默认值
      const shortNews = wx.getStorageSync('shortNewsProgress') || 10;
      this.setData({
        shortNewsProgress: shortNews
      });
    },
  
    /**
     * 核心逻辑：点击顶部导航标签时，切换模块展示
     */
    switchTab(e) {
      const tab = e.currentTarget.dataset.tab; // 获取绑定的 data-tab 值
      this.setData({
        activeTab: tab // 更新当前选中的 tab 状态，触发视图层渲染
      });
    },
  
    // 切换年份 Tab
    switchYear(e) {
      const year = e.currentTarget.dataset.year;
      this.setData({
        activeYear: year
      });
      // TODO: 可在此处根据年份请求对应的 papers 数据
    },
  
    // 返回上一页逻辑
    goBack() {
      wx.navigateBack({
        delta: 1, // 返回上一级页面
        fail: () => {
          // 兜底方案：如果页面栈中没有上一页了，强制回到首页
          wx.reLaunch({
            url: '/pages/index/index'
          });
        }
      });
    },
  
    // ======== 模块跳转事件 ========

    // ======== 统一的答题页跳转逻辑 ========
  goToPractice(e) {
    const { module, subtype } = e.currentTarget.dataset;

    // 并把前端需要的查询条件通过 url 带过去
    wx.navigateTo({
        url: `/pages/quiz/practiceEngine?mode=fragmented&module=${module}&subtype=${subtype}`,
    });
   },
    
    /* 听力模块跳转 */
    onShortNewsTap() { wx.navigateTo({ url: '/pages/shortNews/shortNews' }); },
    onLongDialogTap() { wx.navigateTo({ url: '/pages/longDialog/longDialog' }); },
    onPassageTap() { wx.navigateTo({ url: '/pages/passage/passage' }); },
    
    /* 阅读模块跳转 */
    onFillBlankTap() { wx.navigateTo({ url: '/pages/fillBlank/fillBlank' }); },
    onMatchingTap() { wx.navigateTo({ url: '/pages/matching/matching' }); },
    onCarefulReadingTap() { wx.navigateTo({ url: '/pages/carefulReading/carefulReading' }); },
    
    /* 写译模块跳转 */
    onWritingExTap() { wx.navigateTo({ url: '/pages/writing/writing' }); },
    onTranslationExTap() { wx.navigateTo({ url: '/pages/translation/translation' }); },
    
    /* 单词模块跳转 */
    onReadingWordsTap() { wx.navigateTo({ url: '/pages/readingWords/readingWords' }); },
    onListeningWordsTap() { wx.navigateTo({ url: '/pages/listeningWords/listeningWords' }); },
    
    // 底部大类跳转保留
    onListeningTap() { wx.navigateTo({ url: '/pages/listening/listening' }); },
    onReadingTap() { wx.navigateTo({ url: '/pages/reading/reading' }); },
    onWritingTap() { wx.navigateTo({ url: '/pages/writingMain/writingMain' }); },
    onTranslationTap() { wx.navigateTo({ url: '/pages/translateMain/translateMain' }); }
  })