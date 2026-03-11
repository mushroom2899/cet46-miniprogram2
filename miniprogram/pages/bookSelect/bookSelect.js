// pages/bookSelect/bookSelect.js
const db = wx.cloud.database();

Page({
    /**
     * 页面的初始数据
     */
    data: {
        books: [],          // 词书列表数据
        activeTab: 'all',  // 默认选中全部
        isLoading: false ,   // 加载状态标识
        searchKeyword: '', // 搜索关键词
        searchTimer: null  // 防抖定时器
    },

    /**
     * 生命周期函数--监听页面加载
     */
    onLoad(options) {
        // 页面加载时拉取全部词书数据
        this.fetchBooks('all', '');
    },

    /**
     * 返回上一页
     */
    goBack() {
        wx.navigateBack({
            delta: 1, // 返回上一级
            fail: () => {
                wx.reLaunch({
                    url: '/pages/dashboard/dashboard' 
                });
            }
        });
    },

    /**
     * 搜索框输入监听（带防抖）
     */
    onSearchInput(e) {
        const value = e.detail.value;
        
        // 防抖：清除上一次的定时器
        if (this.data.searchTimer) {
            clearTimeout(this.data.searchTimer);
        }

        // 设置 500ms 后执行搜索，避免频繁请求
        const timer = setTimeout(() => {
            this.setData({ searchKeyword: value });
            // 搜索时，保持当前选中的分类，加入新关键词
            this.fetchBooks(this.data.activeTab, value);
        }, 500);

        this.setData({ searchTimer: timer });
    },

    /**
     * 切换分类标签
     * @param {Object} e - 点击事件对象
     */
    switchTab(e) {
        // 防止快速点击重复请求
        if (this.data.isLoading) return;

        const category = e.currentTarget.dataset.category;
        if (category === this.data.activeTab) return;

        this.setData({ activeTab: category });
        // 切换分类时，带上当前的搜索关键词
        this.fetchBooks(category, this.data.searchKeyword);
    },

    /**
     * 核心查询方法：支持分类 + 搜索,从云数据库拉取词书数据并处理云存储图片链接
     * @param {String} category - 词书分类（默认全部）
     */
    fetchBooks: function (category = 'all', keyword = '') {
        this.setData({ isLoading: true });
        wx.showLoading({ title: '加载中...', mask: true });

        // 构建查询条件：all则查全部，否则按分过滤（解决全量查询警告）
        let query = db.collection('books');
        
        //先处理分类，再处理关键词
        let filter = {};
        if (category !== 'all') {
            filter.category = category;
        }
        if (keyword) {
            filter.title = db.RegExp({
                regexp: keyword,
                options: 'i',
            });
        }       

        // 应用过滤条件
        query = query.where(filter);

        // 执行数据库查询
        query.get()
            .then(res => {
                console.log('数据库数据：', res.data);
                const bookList = res.data || [];
                if (bookList.length === 0) {
                    this.setData({ books: [], isLoading: false });
                    wx.showToast({ title: '无相关词书', icon: 'none' });
                    return; // 后续走finally统一hideLoading
                }

                // 过滤空的fileID
                const validFileIDs = bookList.filter(item => item.cover).map(item => item.cover);
                if (validFileIDs.length === 0) {
                    const fallbackList = bookList.map(book => ({
                        ...book,
                        cover: '/images/ai_example1.png' // 优先使用临时链接，失败则用默认图
                    }));
                    this.setData({ books: fallbackList, isLoading: false });
                    return; // 后续走finally统一hideLoading
                }

                // 调用云函数获取临时链接
                return new Promise((resolve, reject) => {
                    wx.cloud.callFunction({
                        name: 'getTempFileURL', // 云函数名称
                        data: { fileIDs: validFileIDs }, // 传入fileID数组
                        success: (cloudRes) => {
                            if (cloudRes.result.success) {
                                // 构建fileID到tempURL的映射表
                                const fileUrlMap = {};
                                cloudRes.result.data.forEach(fileInfo => {
                                    if (fileInfo.status === 0 && fileInfo.tempFileURL) {
                                        fileUrlMap[fileInfo.fileID] = fileInfo.tempFileURL;
                                    }
                                });
                                // 匹配封面链接
                                const newBookList = bookList.map(book => ({
                                    ...book,
                                    cover: fileUrlMap[book.cover] || '/images/ai_example1.png'
                                }));
                                this.setData({ books: newBookList, isLoading: false });
                                resolve();
                            } else {
                                console.error('云函数返回失败：', cloudRes.result.errMsg);
                                const fallbackList = bookList.map(book => ({
                                    ...book,
                                    cover: '/images/ai_example1.png'
                                }));
                                this.setData({ books: fallbackList, isLoading: false });
                                wx.showToast({ title: '图片加载失败', icon: 'none' });
                                resolve(); // 失败也resolve，保证finally执行
                            }
                        },
                        fail: (cloudErr) => {
                            console.error('调用云函数失败：', cloudErr);
                            const fallbackList = bookList.map(book => ({
                                ...book,
                                cover: '/images/ai_example1.png'
                            }));
                            this.setData({ books: fallbackList, isLoading: false });
                            wx.showToast({ title: '图片加载失败', icon: 'none' });
                            resolve(); // 失败也resolve，保证finally执行
                        }
                    });
                });
            })
            .catch(dbErr => {
                console.error('数据库查询失败：', dbErr);
                this.setData({ books: [], isLoading: false });
                wx.showToast({ title: '数据加载失败，请重试', icon: 'none' });
            })
            .finally(() => {
                // 统一隐藏加载框，确保配对
                wx.hideLoading();
            });
    },

  /**
   * 用户点击选择词书
   */
  onSelectBook(e) {
    const selectedBook = e.currentTarget.dataset.book;
    
    // 弹出加载提示，防止用户重复点击
    wx.showLoading({ title: '正在导入词书...', mask: true });

    //  'user_progress' 集合来保存用户的学习状态
    db.collection('user_progress').add({
      data: {
        bookId: selectedBook._id,       // 关联的词书 ID
        bookTitle: selectedBook.title,  // 词书名称
        category: selectedBook.category, // 关键：存入分类（CET4/CET6）
        totalWords: selectedBook.count, // 总词汇量
        learnedCount: 0,                // 初始已学单词数为 0
        reviewCount: 0,                 // 初始需复习数为 0
        selectTime: db.serverDate()     // 记录选择的时间
      }
    }).then(res => {
      wx.hideLoading();
      wx.showToast({ 
        title: '选择成功！', 
        icon: 'success',
        duration: 1500
      });

      // 延迟 1.5 秒后跳转回首页，让用户看清 Toast 提示
      setTimeout(() => {
        // 如果你的首页是底部 TabBar 页面，必须用 switchTab
        // 如果不是 TabBar 页面，可以使用 wx.redirectTo({ url: '/pages/index/index' })
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }, 1500);

    }).catch(err => {
      wx.hideLoading();
      console.error('保存用户进度失败：', err);
      wx.showToast({ 
        title: '选择失败，请重试', 
        icon: 'none' 
      });
    });
  }

});