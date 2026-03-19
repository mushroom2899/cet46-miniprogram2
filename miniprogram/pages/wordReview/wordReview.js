// pages/wordReview/wordReview.js
Page({
    data: {
      inputValue: '',
      isFocus: false,
      keyboardHeight: 0
    },
  
    onLoad() {
      // 监听键盘高度变化
      wx.onKeyboardHeightChange(res => {
        this.setData({
          keyboardHeight: res.height
        });
      });
    },
  
    focusInput() {
      this.setData({ isFocus: true });
    },
  
    onInput(e) {
      this.setData({
        inputValue: e.detail.value
      });
    }
  });