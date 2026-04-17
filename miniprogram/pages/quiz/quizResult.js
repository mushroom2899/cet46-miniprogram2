// pages/quiz/quizResult.js
Page({
  data: {
    score: 0,
    accuracy: 0,
    scoreRotate: 0, // 初始位置
    results: [],      // 统一变量名，对应 wxml 中的 wx:for="{{results}}"
    totalCount: 0,
    correctCount: 0,
    wrongCount: 0,
    duration: '',

    navBarHeight: 0, 
    menuTop: 0,      
    menuHeight: 0,   
    menuRight: 0    
  },

  onLoad: function (options) {
    this.initNavBar();
    
    // 从全局变量获取刚刚提交的练习数据
    const resultData = getApp().globalData.lastQuizResult;

    if (resultData) {
      this.setData({
        score: resultData.accuracy,
        accuracy: resultData.accuracy,
        totalCount: resultData.totalCount,
        correctCount: resultData.correctCount,
        wrongCount: resultData.wrongCount,
        duration: resultData.duration,
        recordId: resultData.recordId,
        results: resultData.results, // 确保这里对应 wxml
        scoreRotate: (resultData.accuracy / 100) * 180 - 135
      });
    }
  },

      // 动态计算导航栏尺寸
      initNavBar() {
        const systemInfo = wx.getSystemInfoSync();
        const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    
        const navBarHeight = systemInfo.statusBarHeight + menuButtonInfo.height + (menuButtonInfo.top - systemInfo.statusBarHeight) * 2;
    
        this.setData({
          navBarHeight: navBarHeight,
          menuTop: menuButtonInfo.top,
          menuHeight: menuButtonInfo.height,
          menuRight: systemInfo.windowWidth - menuButtonInfo.left + 10 
        });
      },

  goBack() {
    wx.navigateBack();
  },

  viewAll: function() {
  const { recordId } = this.data;
  if (!recordId) {
    console.error("未找到记录ID，请检查数据流");
    return;
  }
  wx.navigateTo({
    url: `/pages/quiz/practiceEngine?mode=review&recordId=${recordId}`,
    success: () => {
      console.log('跳转成功');
    },
    fail: (err) => {
      console.error('跳转失败', err);
    }
  });
}

});