// pages/quiz/practiceEngine.js
const db = wx.cloud.database();

Page({
  data: {
    // 屏幕高度，用于计算拖拽比例
    windowHeight: 0,
    // 底部答题区域的初始高度 (单位 vh)
    bottomPanelHeight: 50, 
    currentIndex: 0,

    // 基础 UI 数据
    navBarHeight: 0,
    menuTop: 0,
    menuHeight: 0,

    // 题库数据置空，等待从云数据库拉取
    questions: [],
    userAnswers: {}
  },

  onLoad(options) {
    this.initNavBar();
    // 1. 接收从 quiz.js 页面传来的路由参数
    const { mode, module, subtype } = options;
    
    // 2. 初始化系统高度 (计算拖拽条需要)
    const sysInfo = wx.getSystemInfoSync();
    this.setData({ windowHeight: sysInfo.windowHeight });

    // 3. 发起请求，去数据库拉取真实题目
    // 加入 || 默认值防止直接点开页面报错
    this.fetchQuestions(mode || 'fragmented', module || 'reading', subtype || 'banked_cloze');
  },

  initNavBar() {
    const sys = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.setData({
      navBarHeight: sys.statusBarHeight + menu.height + (menu.top - sys.statusBarHeight) * 2,
      menuTop: menu.top,
      menuHeight: menu.height
    });
  },

  // ======== 核心功能：向云数据库请求题目 ========
  fetchQuestions(mode, module, subtype) {
    wx.showLoading({ title: '加载题目中...' });

    // 构建查询条件
    const query = {
      'category.scenes': mode,         // 例如：'fragmented'
      'category.major_module': module, // 例如：'reading'
      'category.sub_type': subtype     // 例如：'banked_cloze'
    };

    // 云开发查询
    db.collection('question_bank')
      .where(query)
      .limit(10) // 碎片化刷题每次限制10道
      .get()
      .then(res => {
        wx.hideLoading();
        console.log('【数据库查到的题目】:', res.data); // 打印到控制台，排查查不出数据的问题

        if (res.data.length === 0) {
          wx.showToast({ title: '此题型暂无数据', icon: 'none' });
          return;
        }
        
        // 将拉取到的题目放入页面进行渲染
        this.setData({
          questions: res.data,
          currentIndex: 0
        });
      })
      .catch(err => {
        wx.hideLoading();
        console.error("拉取题目失败", err);
        wx.showToast({ title: '获取数据失败', icon: 'none' });
      });
  },

  // 监听左右滑动切换题目
  onSwiperChange(e) {
    this.setData({
      currentIndex: e.detail.current
    });
  },

  // 处理分屏模式下的拖拽条滑动事件
  onDragMove(e) {
    const windowHeight = this.data.windowHeight;
    const touchY = e.touches[0].clientY;
    let bottomVh = ((windowHeight - touchY) / windowHeight) * 100;

    // 限制最大和最小高度
    if (bottomVh > 75) bottomVh = 75;
    else if (bottomVh < 8.33) bottomVh = 8.33;

    this.setData({
      bottomPanelHeight: bottomVh
    });
  },

  // 处理客观题选项点击
  handleOptionTap(e) {
    const { id, label } = e.currentTarget.dataset;
    this.setData({
      [`userAnswers.${id}`]: label
    });
  },

  // 处理主观题（写作/翻译）输入框的文本输入
  handleTextInput(e) {
    const { id } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`userAnswers.${id}`]: value
    });
  }
});