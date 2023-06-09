import fs, { mkdir } from 'fs'
import axios from 'axios'
import { Parser } from '@json2csv/plainjs'
import { limit } from '@cansiny0320/async-extra'
import { checkIsNormal, delHtmlTag } from './utils.js'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const statusMap = {
  1: '募款中',
  2: '执行中',
  3: '已结束',
}

const maxPageNumber = 500

async function getDetailIds(pageNumber, statuCode) {
  console.log(`爬取${statusMap[statuCode]}第${pageNumber}页`)
  return axios.get(
    `https://ssl.gongyi.qq.com/cgi-bin/gywcom_WXSearchCGI_ES?ptype=stat&s_status=${statuCode}&p=${pageNumber}`,
  )
}

async function getInfo(id, index) {
  console.log(`正在获取第${index + 1}个项目信息`)
  const isNormal = checkIsNormal(id)
  return Promise.all([
    axios.get(
      `https://scdn.gongyi.qq.com/json_data/${isNormal ? 'sub_' : ''}data_detail/${
        id % 100
      }/detail.${id}.json`,
    ),
    axios.get(`https://ssl.gongyi.qq.com/cgi-bin/ProjInfoQuery.fcgi?id=${id}&type=proj_base`),
  ])
}

function writeFile(result, statuCode) {
  const fields = [
    '项目名称',
    '项目起止时间',
    '善款接收',
    '执行机构',
    '项目简介',
    '筹款方案备案号',
    '筹款目标',
    '已筹款金额',
    '状态',
  ]
  try {
    const parser = new Parser({ fields })
    const csv = parser.parse(result)
    mkdir(resolve(__dirname, '../data'), { recursive: true }, err => {
      if (err) {
        console.log(err)
      }
    })
    fs.writeFile(
      resolve(__dirname, `../data/${statuCode}.csv`),
      `\ufeff${csv}`,
      'utf-8',
      function (err) {
        if (err) {
          return console.log(err)
        }
        console.log(`数据写入完成，路径为 data/${statuCode}.csv`)
      },
    )
  } catch (err) {
    console.error(err)
  }
}

async function main(statuCode) {
  const idsReqs = []
  const detailReqs = []
  const ids = []
  const results = []
  for (let i = 1; i <= maxPageNumber; i++) {
    idsReqs.push(() => getDetailIds(i, statuCode))
  }

  const idsRes = await limit(idsReqs, 64)

  idsRes.forEach(res => {
    ids.push(...res.data.plist.map(e => e.id))
  })

  console.log(`总共有${ids.length}个项目`)

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    detailReqs.push(() => getInfo(id, i))
  }

  const detailRes = await limit(detailReqs, 64)

  detailRes.forEach(([res, pageInfoRes]) => {
    const data = res.data
    const pageInfo = pageInfoRes.data
    const id = pageInfo.msg.base.id
    const msg = checkIsNormal(id) ? data.msg : data
    const title = msg.base.title
    const time = `${msg.base.startTime} - ${
      msg.base.endTime === '0' ? '2023-12-31' : msg.base.endTime
    }`
    const eOrgName = msg.base.eOrgName
    const fundName = msg.base.fundName
    const content = delHtmlTag(msg.detail.desc).replace(/(^\s*)|(\s*$)/g, '')
    const recordNum = msg.base.record_num
    const needMoney = msg.base.needMoney.slice(0, -2)
    const recvedMoney = pageInfo.msg.stat.recvedMoney / 100
    const status = statusMap[parseInt(msg.base.status)]
    results.push({
      项目名称: title,
      项目起止时间: time,
      善款接收: fundName,
      执行机构: eOrgName,
      项目简介: content,
      筹款方案备案号: recordNum,
      筹款目标: needMoney,
      已筹款金额: recvedMoney,
      状态: status,
    })
  })

  writeFile(results, statuCode)
}

console.time('总耗时')
for (let i = 1; i <= 3; i++) {
  await main(i)
}
console.timeEnd('总耗时')
