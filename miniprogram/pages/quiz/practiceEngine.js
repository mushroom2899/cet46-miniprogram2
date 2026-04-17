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
    userAnswers: {},
    isReview: false, // 初始化查看模式标识
    showSubmitBtn: false
  },

  onLoad(options) {
    this.initNavBar();
    
    if (options.mode === 'review') {
      const lastResult = getApp().globalData.lastQuizResult;
      if (lastResult) {

        const mappedQuestions = (lastResult.originalQuestions || []).map(q => {
          // 在 results 数组中找到对应题目的结果项
          const resultItem = lastResult.results.find(r => r.questionId === q._id);
          return {
            ...q,
            answer: resultItem ? resultItem.correctAnswer[0] : '' 
          };
        });
    
        this.setData({
          questions: mappedQuestions,
          userAnswers: lastResult.userAnswers || {},
          isReview: true,
          showSubmitBtn: false,
          currentIndex: 0
        });
        return;
      }
    }
  
    // 模式 2：正常练习模式（原有的逻辑）
    const { mode, module, subtype } = options;
    const sysInfo = wx.getSystemInfoSync();
    this.setData({ windowHeight: sysInfo.windowHeight });
    this.fetchQuestions(mode || 'fragmented', module || 'reading', subtype || 'banked_cloze');
    this.setData({ 
      startTime: Date.now() // 记录练习开始时间
    });
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

      // 返回上一页逻辑
      goBack() {
        wx.navigateBack({
          delta: 1, // 返回上一级页面
          fail: () => {
            // 兜底方案：如果页面栈中没有上一页了，强制回到首页
            wx.reLaunch({
              url: '/pages/quiz/quiz'
            });
          }
        });
      },

  // ======== 核心功能：向云数据库请求题目 ========
  fetchQuestions(mode, module, subtype) {
    wx.showLoading({ title: '加载题目中...' });
    console.log("查询条件：", mode, module, subtype);

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


  // 处理主观题（写作/翻译）输入框的文本输入
  handleTextInput(e) {
    const { id } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`userAnswers.${id}`]: value
    });
  },

  // 处理客观题选项点击
    handleOptionTap(e) {
      if (this.data.isReview) {
        return; // 查看模式下，禁止修改答案
      }
      const { id, label } = e.currentTarget.dataset;
      const { userAnswers, questions } = this.data;
      
      userAnswers[id] = label;
      
      // 逻辑：判断第十道题是否已选
      // 数组索引从 0 开始，第十道题是 questions[9]
      let tenthQuestionId = questions[9] ? questions[9]._id : null;
      let isTenthAnswered = tenthQuestionId && userAnswers[tenthQuestionId];
  
      this.setData({ 
        userAnswers,
        // 如果第十题有答案了，则显示按钮
        showSubmitBtn: isTenthAnswered ? true : false
      });
    },

  submitQuiz: function() {
    const { questions, userAnswers } = this.data;
    const totalCount = questions.length;
    const answeredCount = Object.keys(userAnswers).length;

    // 逻辑：检查是否所有题目都已经作答
    if (answeredCount < totalCount) {
      wx.showToast({
        title: `你还有${totalCount - answeredCount}题未做，请全部完成后再提交`,
        icon: 'none',
        duration: 2000
      });
      return; // ！！关键：不执行后续结算逻辑，不跳转
    }
    this.doSubmit(); // 调用之前写的结算方法
  },

// 执行真正的提交逻辑
doSubmit: function() {
  const endTime = Date.now(); // 获取结束时间
  const { questions, userAnswers, startTime } = this.data;
  
  // 2. 核心逻辑：计算对错
  let correctCount = 0;

  const details = questions.map((q, index) => {
    const uAns = userAnswers[q._id]; 
    
    let isCorrect = false; 

    if (Array.isArray(q.answer)) {
      isCorrect = q.answer.includes(uAns); 
    } else {
      isCorrect = uAns === q.answer;
    }

    if (isCorrect) correctCount++;
    
    return {
      index: index + 1,
      questionId: q._id,
      userAnswer: uAns,
      correctAnswer: q.answer,
      isCorrect: isCorrect,
      status: isCorrect ? 1 : 2 
    };
  });

  const totalCount = questions.length;
  const wrongCount = totalCount - correctCount;
  const accuracy = Math.round((correctCount / totalCount) * 100);
  
  // 计算耗时
  const durationMs = endTime - (startTime || endTime);
  const seconds = Math.floor(durationMs / 1000);
  const durationText = seconds > 60 ? `${Math.floor(seconds/60)}分${seconds%60}秒` : `${seconds}秒`;

  wx.showLoading({ title: '报告生成中...' });

  // 3. 写入云数据库
  db.collection('quiz_records').add({
    data: {
      quizTime: db.serverDate(),
      totalCount,
      correctCount,
      wrongCount,
      accuracy,
      duration: durationText,
      details: details, // 详细对错情况
      module: questions[0].category.major_module // 记录模块
    }
  }).then(res => {
  // 【关键步骤】数据库写入成功后才执行跳转
    wx.hideLoading();

    // A. 获取自动生成的 ID
    const recordId = res._id; 

    // B. 准备存入全局变量的数据
    const resultData = {
      score: accuracy, // 预测分可以用正确率换算
      accuracy,
      duration: durationText,
      totalCount,
      correctCount,
      wrongCount,
      originalQuestions: this.data.questions,
      userAnswers: this.data.userAnswers,
      results: details, // 对应结果页的 results 列表
      recordId: recordId
    };

    console.log("resultData",resultData);

    // C. 存入全局变量
    getApp().globalData.lastQuizResult = resultData;

    // D. 执行跳转
    wx.redirectTo({
      url: `/pages/quiz/quizResult?recordId=${recordId}`,
      success: () => {
        console.log('跳转成功');
      },
      fail: (err) => {
        console.error('跳转失败', err);
      }
    });
  }).catch(err => {
    wx.hideLoading();
    wx.showToast({ title: '保存记录失败', icon: 'none' });
    console.error(err);
  });
}

});