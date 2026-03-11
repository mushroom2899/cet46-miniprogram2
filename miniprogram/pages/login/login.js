// pages/login/login.js
Page({
    /**
     * 页面的初始数据
     */
    data: {
      isAgree: false // 是否同意协议
    },
  
    onLoad(options) {
      // 隐藏左上角的小房子，防止用户通过默认按钮逃逸回主页
      this.hideHome();
    },
  
    onShow() {
      this.hideHome();
    },
  
    hideHome() {
      if (wx.hideHomeButton) {
        wx.hideHomeButton();
      }
    },
  
    /**
     * 监听复选框状态改变
     */
    onAgreeChange(e) {
      this.setData({
        isAgree: e.detail.value.length > 0
      });
    },
  
    goTerms() { 
      wx.showToast({ title: '服务条款待补充', icon: 'none' }); 
    },
    
    goPrivacy() { 
      wx.showToast({ title: '隐私协议待补充', icon: 'none' }); 
    },
  
    /**
     * 微信登录入口方法
     */
    onWechatLogin() {
      // 1. 协议校验：未勾选则提示
      if (!this.data.isAgree) {
        wx.showToast({
          title: '请先同意服务条款和隐私协议',
          icon: 'none',
          duration: 2000
        });
        return;
      }
  
      // 2. 执行核心登录逻辑
      this.doWechatLogin();
    },
  
    /**
     * 微信登录核心逻辑
     */
    doWechatLogin() {
      wx.showLoading({ title: '登录请求中...', mask: true });
  
      wx.cloud.callFunction({
        name: 'login',
        success: (res) => {
          // 1. 获取用户 openid
          const openid = res.result.openid;
          
          // 2. 将获取到的 openid 存入本地缓存，这样首页的路由守卫才会放行
          wx.setStorageSync('openid', openid); 
          
          // 3. 将用户信息存入/更新到数据库
          this.saveUserInfo(openid);
          
          // 4. 检查用户是否有学习进度，决定跳去哪个页面
          this.checkUserProgress(openid);
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('云函数调用失败：', err);
          wx.showModal({
            title: '登录失败',
            content: '无法连接到云服务，请检查网络或确认云函数已部署',
            showCancel: false
          });
        }
      });
    },
  
    /**
     * 检查用户学习进度，决定页面分发
     */
    checkUserProgress(openid) {
      const db = wx.cloud.database();
      
      db.collection('user_progress').where({
        _openid: openid
      }).get({
        success: (res) => {
          wx.hideLoading();
          
          // 判断条件：如果有进度记录，说明不是第一次用
          if (res.data && res.data.length > 0) {
            // 老用户：直接跳到首页（如果你首页是 TabBar 页面，建议换成 wx.switchTab）
            wx.reLaunch({
              url: '/pages/index/index'
            });
          } else {
            // 新用户：跳到选书页面
            wx.reLaunch({
              url: '/pages/bookSelect/bookSelect'
            });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('查询用户进度失败：', err);
          // 兜底方案：万一查库失败，默认让他去选书页面
          wx.reLaunch({
            url: '/pages/bookSelect/bookSelect'
          });
        }
      });
    },
  
    /**
     * 用户信息存入云数据库 
     */
    saveUserInfo(openid) {
      const db = wx.cloud.database();
      // 先查询用户是否已存在，避免重复添加
      db.collection('users').where({
        openid: openid
      }).get({
        success: (res) => {
          if (res.data.length === 0) {
            // 用户不存在，添加新用户
            db.collection('users').add({
              data: {
                openid: openid,
                avatarUrl: '/images/avatar.png', // 默认用户图片
                nickName: '学习者_' + openid.slice(-4), // 取 openid 最后四位作为随机标识
                studyCount: 0,
                loginTime: db.serverDate(),
                createTime: db.serverDate()
              }
            });
          } else {
            // 用户已存在，仅更新最后登录时间
            db.collection('users').doc(res.data[0]._id).update({
              data: {
                loginTime: db.serverDate()
              }
            });
          }
        },
        fail: (err) => {
          console.error('更新用户数据失败', err);
        }
      });
    }
  });