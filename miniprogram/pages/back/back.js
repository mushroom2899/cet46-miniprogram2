/**
   * 从内存队列中提取下一个单词
   */
async loadNextWord() {
  // 注意：去掉了 currentPhase，因为我们完全基于单词的 step（是否达到3次）来判断进度
  let { sessionWords, activeQueue, pendingQueue } = this.data;

  // 1. 如果当前活跃队列空了
  if (activeQueue.length === 0) {
    // 2. 核心判断：如果等待队列也空了，说明所有 5 个单词的 step 都已经达到 3！
    if (pendingQueue.length === 0) {
      // 彻底学完本组，直接触发结算并保存到数据库！
      await this.finishBatch(); 
      return; // 阻断执行，不要再往下找单词了
    } else {
      // 兜底补齐：等待队列里还有未达标（step < 3）的词，随机挑最多3个拿出来继续学
      activeQueue = pendingQueue.sort(() => Math.random() - 0.5).splice(0, Math.min(3, pendingQueue.length));
    }
  }

  // 3. 从队列头部取出一个单词来展示
  let nextIdx = activeQueue.shift(); 
  let target = sessionWords[nextIdx];

  // 4. 重置页面状态，推送到视图
  this.setData({
    currentWord: target,
    currentIndex: nextIdx,
    activeQueue,      // 更新被 shift 扣减后的活跃队列
    pendingQueue,     // 更新后的等待队列
    isAnswered: false,
    selectedIndex: -1,
    isLoading: false
  });

  // 5. 生成干扰选项并播放发音
  // 从缓存池里随机挑 3 个干扰项
  let shuffledDistractors = this.data.batchDistractors.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  this.generateOptions(target, shuffledDistractors);

  this.playAudio();
},