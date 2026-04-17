// pages/dashboard/dashboard.js
const db = wx.cloud.database();

Page({
  data: {
    bookTitle: '暂未选择',
    bookCover: '', // 用于存放真实封面的 URL
    category: '-',
    learnedCount: 10,
    totalWords: 0,
    progressPercent: 0, 
    
    todayLearn: 5,
    totalLearn: 10,
    todayDuration: 20,
    totalDuration: 32,
    
    studyCount: 0, 
    checkinDates: [], 
    
    weekDates: []
  },

  onLoad(options) {
    // 移除 onLoad 中的重复请求，统一交由 onShow 处理，避免页面进入时请求两次打架
  },

  onShow() {
    this.loadDashboardData();
  },

  goBack() {
    wx.navigateBack({
      delta: 1, 
      fail: () => {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  },

  goToBookSelect() {
    wx.navigateTo({ url: '/pages/bookSelect/bookSelect' });
  },

// 加载仪表盘数据 (使用 async/await 保证执行顺序)
async loadDashboardData() {
    wx.showLoading({ title: '加载数据中...', mask: true });

    try {
      // 1. 并行获取基本进度、用户数据，以及 2 秒的保底延时
      const progressPromise = db.collection('user_progress')
        .orderBy('selectTime', 'desc') 
        .get();
      const userPromise = db.collection('users').get();
      const delayPromise = new Promise(resolve => setTimeout(resolve, 2000));

      // 等待这三个初始任务完成
      const [progressRes, usersRes] = await Promise.all([progressPromise, userPromise, delayPromise]);

      // ======= 处理学习进度 =======
      if (progressRes.data.length > 0) {
        const progress = progressRes.data[0]; 
        
        let total = parseInt(progress.totalWords) || 0;
        let learned = parseInt(progress.learnedCount) || 0;
        let percent = total > 0 ? Math.floor((learned / total) * 100) : 0;

        this.setData({
          bookTitle: progress.bookTitle || '暂未选择',
          category: progress.category || '综合',
          learnedCount: learned,
          totalWords: total,
          progressPercent: percent
        });

        // ======= 等待获取封面和转换链接全部完成 =======
        if (progress.bookId) {
          try {
            // 使用 await 强制等待查书本操作完成
            const bookRes = await db.collection('books').doc(progress.bookId).get();
            
            if (bookRes.data && bookRes.data.cover) {
              const coverUrl = bookRes.data.cover.trim(); 
              
              if (coverUrl.startsWith('cloud://')) {
                // 使用 await 强制等待云函数转换完成
                const tempRes = await wx.cloud.callFunction({
                  name: 'getTempFileURL', 
                  data: { fileIDs: [coverUrl] }
                });
                
                // 校验返回结果并设置图片
                if (tempRes.result && tempRes.result.success && tempRes.result.data && tempRes.result.data.length > 0) {
                  const tempUrl = tempRes.result.data[0].tempFileURL;
                  this.setData({ bookCover: tempUrl || coverUrl });
                } else {
                  this.setData({ bookCover: coverUrl });
                }
              } else {
                // Http 链接直接渲染
                this.setData({ bookCover: coverUrl }); 
              }
            }
          } catch (coverErr) {
            console.error('获取或转换词书封面失败', coverErr);
          }
        }
      }

      // ======= 处理用户签到数据 =======
      if (usersRes.data.length > 0) {
        const user = usersRes.data[0];
        this.setData({
          studyCount: user.studyCount || 0,
          checkinDates: user.checkinDates || []
        });
      }

      // 数据处理完毕，生成日历
      this.generateCalendar();
      
      wx.hideLoading();

    } catch (err) {
      console.error('加载全局数据失败', err);
      // 如果出现严重网络错误，在这里关闭加载框兜底
      wx.hideLoading(); 
      wx.showToast({ title: '加载稍有延迟', icon: 'none' });
      this.generateCalendar(); 
    }
  },

  /**
   * 动态生成日历
   */
  generateCalendar() {
    const today = new Date();
    const currentDay = today.getDay(); 
    const offset = currentDay === 0 ? 6 : currentDay - 1; 
    const monday = new Date(today);
    monday.setDate(today.getDate() - offset);

    const weekLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const weekDates = [];
    
    // 确保从 data 中安全读取
    const userCheckins = this.data.checkinDates || [];

    for (let i = 0; i < 7; i++) {
      let dateObj = new Date(monday);
      dateObj.setDate(monday.getDate() + i);
      
      let isToday = (dateObj.toDateString() === today.toDateString());
      
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      let hasSignedIn = userCheckins.includes(dateStr);
      
      weekDates.push({
        label: weekLabels[i],
        date: dateObj.getDate(), 
        isToday: isToday,
        isActive: hasSignedIn
      });
    }

    this.setData({ weekDates: weekDates });
  }
});