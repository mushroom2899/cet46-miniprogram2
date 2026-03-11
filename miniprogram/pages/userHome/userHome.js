Page({
    data: {
      userInfo: {}, // 存放当前用户数据
      // 学习量弹窗数据
      isLearnModalVisible: false, // 控制弹窗是否显示
      currentLearnCount: 5,       // 目前实际生效的单词量
      tempLearnCount: 5,           // 用户在弹窗里点击选中、但还没点确定的临时单词量

      // 复习量弹窗数据
      isReviewModalVisible: false,
      currentReviewCount: 10,
      tempReviewCount: 10,
  
      // 发音类型弹窗数据
      isAccentModalVisible: false,
      currentAccentType: 2, // 2:美式, 1:英式
      tempAccentType: 2,

      navBarHeight: 0, 
      menuTop: 0,      
      menuHeight: 0,   
      menuRight: 0     
    },
  
    onLoad(options) {
      this.initNavBar();
      this.fetchUserInfo(); // 拉取用户信息

    // 一次性读取所有的本地设置，没有则赋予默认值
    const savedLearnCount = wx.getStorageSync('learnCount') || 5;
    const savedReviewCount = wx.getStorageSync('reviewCount') || 10;
    const savedAccentType = wx.getStorageSync('accentType') || 2;

    // 将读取到的值赋给页面变量
    this.setData({
            currentLearnCount: savedLearnCount,
            tempLearnCount: savedLearnCount,
            currentReviewCount: savedReviewCount,
            tempReviewCount: savedReviewCount,
            currentAccentType: savedAccentType,
            tempAccentType: savedAccentType
          });
    },

        // 从数据库拉取用户最新信息
        fetchUserInfo() {
            const openid = wx.getStorageSync('openid');
            if (!openid) return;
            
            wx.cloud.database().collection('users').where({ openid: openid }).get().then(res => {
              if (res.data.length > 0) {
                const user = res.data[0];
        
                // 提前把 ID 截取好（取后6位）
                const shortId = user.openid ? user.openid.slice(-6) : '';
                this.setData({ 
                  userInfo: user,
                  shortId: shortId // 显示的短 ID 变量
                 });
              }
            });
          },
        
          // === 用户点击头像授权后的回调
          onChooseAvatar(e) {
            const tempFilePath = e.detail.avatarUrl; // 拿到微信给的临时图片路径
            
            // 马上让页面显示新头像（提供即时反馈）
            this.setData({ 'userInfo.avatarUrl': tempFilePath });
            
            wx.showLoading({ title: '上传头像中...', mask: true });
            
            // 因为是临时路径，必须上传到云存储永久保存
            const openid = wx.getStorageSync('openid');
            const cloudPath = `user_avatars/${openid}_${Date.now()}.png`; // 构造唯一的云端文件名
            
            wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFilePath,
              success: (res) => {
                const fileID = res.fileID; // 这是永久的云存储 ID
                this.setData({ 'userInfo.avatarUrl': fileID });
                this.updateUserDB({ avatarUrl: fileID }); // 更新到数据库
                wx.hideLoading();
              },
              fail: (err) => {
                wx.hideLoading();
                wx.showToast({ title: '头像上传失败', icon: 'none' });
              }
            });
          },
        
          // 用户输入/授权昵称后的回调
          onInputNickname(e) {
            const nickName = e.detail.value;
            if (!nickName) return;
            
            this.setData({ 'userInfo.nickName': nickName });
            this.updateUserDB({ nickName: nickName }); // 更新到数据库
          },
        
          // 封装：更新数据库的通用方法
          updateUserDB(updateData) {
            const openid = wx.getStorageSync('openid');
            wx.cloud.database().collection('users').where({ openid: openid }).update({
              data: updateData,
              success: () => wx.showToast({ title: '更新成功', icon: 'success' })
            });
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

        // === 学习量弹窗控制逻辑 ===
    
    // 1. 点击列表栏，打开弹窗
    openLearnCountModal() {
        this.setData({ 
          isLearnModalVisible: true,
          tempLearnCount: this.data.currentLearnCount // 打开时，临时值等于当前真实值
        });
      },
    
      // 2. 点击弹窗里的某一个选项
      selectTempLearnCount(e) {
        const val = e.currentTarget.dataset.val;
        this.setData({ tempLearnCount: val });
      },
    
      // 3. 点击取消（或点击遮罩）关闭弹窗
      closeLearnCountModal() {
        this.setData({ isLearnModalVisible: false });
      },
    
      // 4. 点击确定，保存设置并关闭弹窗
      confirmLearnCountModal() {
        const newCount = this.data.tempLearnCount;
        this.setData({ 
          currentLearnCount: newCount,
          isLearnModalVisible: false 
        });
        
        // 这里你可以将 newCount 存入本地缓存，或者更新到云数据库
        wx.setStorageSync('learnCount', newCount);
        wx.showToast({ title: '设置成功', icon: 'success' });
      },
      // === 复习单词量 弹窗逻辑 ===
openReviewCountModal() {
    this.setData({ 
      isReviewModalVisible: true,
      tempReviewCount: this.data.currentReviewCount 
    });
  },
  selectTempReviewCount(e) {
    this.setData({ tempReviewCount: e.currentTarget.dataset.val });
  },
  closeReviewCountModal() {
    this.setData({ isReviewModalVisible: false });
  },
  confirmReviewCountModal() {
    const newCount = this.data.tempReviewCount;
    this.setData({ 
      currentReviewCount: newCount,
      isReviewModalVisible: false 
    });
    wx.setStorageSync('reviewCount', newCount);
    wx.showToast({ title: '设置成功', icon: 'success' });
  },

  // === 默认发音类型 弹窗逻辑 ===
  openAccentTypeModal() {
    this.setData({ 
      isAccentModalVisible: true,
      tempAccentType: this.data.currentAccentType 
    });
  },
  selectTempAccent(e) {
    this.setData({ tempAccentType: e.currentTarget.dataset.val });
  },
  closeAccentTypeModal() {
    this.setData({ isAccentModalVisible: false });
  },
  confirmAccentTypeModal() {
    const newType = this.data.tempAccentType;
    this.setData({ 
      currentAccentType: newType,
      isAccentModalVisible: false 
    });
    wx.setStorageSync('accentType', newType);
    wx.showToast({ title: '设置成功', icon: 'success' });
  },
  
    // 返回上一页
    goBack() {
      wx.navigateBack({ delta: 1 });
    },

  // 处理退出登录逻辑
  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#EA5455',
      success: (res) => {
        if (res.confirm) {
          //  1.全部清空，一点不留！
          wx.clearStorageSync(); 
          
          wx.showToast({ title: '已退出', icon: 'success', duration: 1000 });

          setTimeout(() => {
            wx.reLaunch({ url: '/pages/login/login' });
          }, 1000);
        }
      }
    });
  }

  });