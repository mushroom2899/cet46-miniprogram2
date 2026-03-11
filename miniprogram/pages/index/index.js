// pages/index/index.js
const db = wx.cloud.database();
const _ = db.command; // 引入数据库操作符，用于向数组中添加不重复的元素

Page({
    /**
     * 页面的初始数据
     */
    data: {
      currentDate: '',
      learnNumber: 0,   // 初始化为 0
      reviewNumber: 0,  // 初始化为 0
      userInfo: null, // 用于存放用户资料（头像、昵称等）
      isCheckedIn: false, // 记录今天是否已经签到
      currentProgress: null // 存放当前的学习进度对象
    //   currentBook: '暂未选择词书' // 可选：用来在主页显示当前词书名
    },
  
    /**
     * 生命周期函数--监听页面加载
     */
    onLoad(options) {
      this.setCurrentDate();

      const openid = wx.getStorageSync('openid');
      if (openid) {
        // 弹出带蒙层的全屏加载提示
        wx.showLoading({
          title: '同步数据中...',
          mask: true // 开启透明蒙层，防止这 2 秒内用户乱点其他按钮导致报错
        });
  
        // 强制延时 1.5 秒后关闭提示
        setTimeout(() => {
          wx.hideLoading();
        }, 1500);
      }
    },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 路由守卫：查验本地是否有登录凭证
    const openid = wx.getStorageSync('openid');
    if (!openid) {
      // 如果没有凭证（比如刚退出登录），立刻拦截并踢回登录页！
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return; // 终止后续代码执行
    }
    // 每次进入页面时，检查用户今天的签到状态
    this.checkUserCheckinStatus();
    // 只有经过了上面鉴权，才允许去云端拉取数据
    this.fetchUserProgress();
       // 每次回到首页，都重新拉取一次用户的最新资料
    this.fetchUserInfo(); 
  },

    navigateToUserHome() {
        wx.navigateTo({
          url: '/pages/userHome/userHome'
        });
      },
  
  /**
   * 获取当前日期并格式化为 YYYY年MM月DD日
   */
  setCurrentDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    this.setData({
      currentDate: `${year}年${month}月${day}日`
    });
  },

  /**
   * 获取标准化日期字符串 (如 2026-03-04)
   */
  getTodayDateString() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * 检查用户今日签到状态
   */
  checkUserCheckinStatus() {
    const todayStr = this.getTodayDateString();
    
    db.collection('users').get().then(res => {
      if (res.data.length > 0) {
        const user = res.data[0];
        // 如果数据库里记录的最后签到日期是今天，说明已签到
        this.setData({
          isCheckedIn: user.lastCheckinDate === todayStr
        });
      }
    }).catch(err => {
      console.error('获取用户签到状态失败', err);
    });
  },

  // 签到卡片点击事件
  onCheckinTap() {
    // 1. 如果已经签到过，直接拦截并提示
    if (this.data.isCheckedIn) {
      wx.showToast({ title: '今日已签到', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '打卡中...' });
    const todayStr = this.getTodayDateString();

    // 2. 查询并更新用户数据
    db.collection('users').get().then(res => {
      if (res.data.length > 0) {
        const user = res.data[0];
        const newCount = (user.studyCount || 0) + 1; // 签到天数 + 1
        
        db.collection('users').doc(user._id).update({
          data: {
            studyCount: newCount,
            lastCheckinDate: todayStr, // 更新最后签到日期
            checkinDates: _.addToSet(todayStr) // 把今天添加到历史签到数组中
          }
        }).then(() => {
          this.setData({ isCheckedIn: true });
          wx.hideLoading();
          wx.showToast({ title: '签到成功！', icon: 'success' });
        });
      } else {
        // 如果是纯新用户（数据库还没有他的记录），则创建一条新记录
        db.collection('users').add({
          data: {
            studyCount: 1,
            lastCheckinDate: todayStr,
            checkinDates: [todayStr],
            createTime: db.serverDate()
          }
        }).then(() => {
          this.setData({ isCheckedIn: true });
          wx.hideLoading();
          wx.showToast({ title: '签到成功！', icon: 'success' });
        });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '签到失败，请检查网络', icon: 'none' });
      console.error('签到错误', err);
    });
  },

  // 拉取头像
  fetchUserInfo() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return;
    
    db.collection('users').where({ 
      openid: openid 
    }).get({
      success: (res) => {
        if (res.data.length > 0) {
          this.setData({ 
            userInfo: res.data[0] 
          });
        }
      },
      fail: (err) => {
        console.error('首页拉取用户信息失败：', err);
      }
    });
  },

  /**
   * 从数据库获取用户最新的学习进度
   */
  fetchUserProgress() {
    // 显示局部加载提示（可选）
    wx.showNavigationBarLoading();

    db.collection('user_progress')
      .orderBy('selectTime', 'desc') // 按照选择时间倒序排列
      .limit(1)                      // 只取最新的一条记录
      .get()
      .then(res => {
        wx.hideNavigationBarLoading();
        
        // 判断用户是否已经选择过词书
        if (res.data.length > 0) {
          const progress = res.data[0];
          
          this.setData({
            // 这里的业务逻辑你可以自己微调：
            // 例如 Learn 显示剩余待学单词量 = 总词数 - 已学词数
            learnNumber: progress.totalWords - progress.learnedCount, 
            
            // Review 显示需要复习的数量
            reviewNumber: progress.learnedCount,
            
            // 将当前词书名存下来备用（如果你想在页面上显示的话）
            currentBook: progress.bookTitle,
            currentProgress: res.data[0]
          });
        } else {
          // 如果数据库里一条记录都没有，说明是纯新用户
          this.setData({
            learnNumber: 0,
            reviewNumber: 0,
            currentBook: '请先选择词书'
          });
        }
      })
      .catch(err => {
        wx.hideNavigationBarLoading();
        console.error('获取学习进度失败：', err);
        wx.showToast({
          title: '数据加载失败',
          icon: 'none'
        });
      });
  },
  
    // Learn 按钮点击事件
    onLearnTap() {
        const p = this.data.currentProgress;
        // 加上参数进行跳转
        wx.navigateTo({
          url: `/pages/wordLearn/wordLearn?progressId=${p._id}&category=${p.category}`
        });
      },
  
    // Review 按钮点击事件
    onReviewTap() {
      wx.navigateTo({
        url: '/pages/wordReview/wordReview'
      });
    },
  
// 底部 TabBar 切换
switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'quiz') {
      wx.navigateTo({  
        url: '/pages/quiz/quiz'
      });
    } else if (tab === 'dashboard') {
      wx.navigateTo({
        url: '/pages/dashboard/dashboard'
      });
    }
  }
  });