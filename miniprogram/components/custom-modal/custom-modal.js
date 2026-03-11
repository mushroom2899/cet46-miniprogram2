// components/custom-modal/custom-modal.js
Component({
    properties: {
      visible: { type: Boolean, value: false },
      title: { type: String, value: '提示' },
      cancelText: { type: String, value: '取消' },
      confirmText: { type: String, value: '确定' }
    },
    methods: {
      onCancel() {
        this.triggerEvent('cancel');
      },
      onConfirm() {
        this.triggerEvent('confirm');
      },
      preventBubble() {
        // 阻止点击弹窗白底区域时，触发遮罩层的关闭
      },
      preventTouchMove() {
        // 空函数，单纯为了吸收滑动事件，彻底阻断滑动穿透到底层页面
      }
    }
  })