export function checkIsNormal(id) {
  return id.toString().length === 10
}

export function delHtmlTag(str) {
  return str.replace(/<[^>]+>/g, '') //去掉所有的html标记
}
