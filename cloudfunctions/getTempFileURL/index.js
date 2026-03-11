// cloudfunctions/getTempFileURL/index.js
// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 接收前端传入的fileID数组
    const { fileIDs } = event;
    if (!fileIDs || fileIDs.length === 0) {
      return { success: false, errMsg: 'fileIDs不能为空' };
    }
    // 调用云存储API获取临时链接（云函数内不受权限限制）
    const result = await cloud.getTempFileURL({
      fileList: fileIDs
    });
    return { success: true, data: result.fileList };
  } catch (err) {
    console.error('获取临时链接失败：', err);
    return { success: false, errMsg: err.message };
  }
};