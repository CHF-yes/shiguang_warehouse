// 东北大学秦皇岛分校 (NEUQ) 正方教务课表导入脚本
// 适配页面：https://jwxt.neuq.edu.cn/eams/homeExt.action

/**
 * 解析表格视图 (Grid View)
 * 适配 NEUQ 特有结构：课程标题在 <b> 标签，周次信息内嵌在标题 font 中
 */
function parserTable() {
    const regexClean = /[●★○\s]/g;
    const courseInfoList = [];
    const $ = window.jQuery; 
    if (!$) return courseInfoList;

    // 遍历每一天的课表单元格
    $('#kbgrid_table_0 td.td_wrap').each((i, td) => {
        const day = parseInt($(td).attr('id').split('-')[0]); 
        
        $(td).find('.timetable_con.text-left').each((idx, courseEl) => {
            // 1. 提取课程名称 (NEUQ 标题在 <b> 标签)
            const name = $(courseEl).find('.title b').text().replace(regexClean, '').trim();
            
            // 2. 提取核心信息行 (包含节次、周次、地点、教师)
            //    结构：[节次] (周次信息) | 地点 | 教师
            const infoRows = $(courseEl).find('p font');
            
            // 初始化变量
            let sections = [];
            let weeks = [];
            let position = '';
            let teacher = '';

            infoRows.each((rowIdx, font) => {
                const text = $(font).text().trim();
                if (rowIdx === 0) {
                    // 第一行：包含节次和周次标识
                    const sectionMatch = text.match(/(\d+-\d+节)/);
                    if (sectionMatch) {
                        sections = parserSections(sectionMatch[1].replace('节', ''));
                        // 提取周次信息 (例如 (4-15周) 或 (4-15,17-18周))
                        const weekStr = text.split(/\(|\)/)[1]?.replace(/周/g, '') || '';
                        weeks = parserWeeks(weekStr);
                    }
                } else if (rowIdx === 1) {
                    // 第二行：上课地点
                    position = text.split(/\s+/).pop() || '';
                } else if (rowIdx === 2) {
                    // 第三行：教师姓名
                    teacher = text.replace(/教师\s*：/g, '').trim() || '';
                }
            });

            // 数据校验并入库
            if (name && position && teacher && sections.length && weeks.length) {
                const data = {
                    name,
                    day,
                    weeks,
                    teacher,
                    position,
                    startSection: sections[0],
                    endSection: sections[sections.length - 1]
                };
                courseInfoList.push(data);
            }
        });
    });
    return courseInfoList;
}

/**
 * 解析列表视图 (List View) - 备用逻辑
 */
function parserList() {
    const regexClean = /[●★○\s]/g;
    const $ = window.jQuery; 
    if (!$) return [];
    
    let courseInfoList = [];
    // 遍历周一到周日 (索引 1-7)
    $('#kblist_table tbody').each((dayIndex, tbody) => {
        if (dayIndex < 1 || dayIndex > 7) return;
        
        $(tbody).find('tr').slice(1).each((trIndex, tr) => {
            const tds = $(tr).find('td');
            if (tds.length === 0) return;

            let name = '';
            let fontElements = tds.last().find('p font');
            
            // 处理跨列情况
            if (tds.length > 1) {
                name = $(tds[1]).find('.title b').text().replace(regexClean, '').trim();
            } else {
                name = $(tds[0]).find('.title b').text().replace(regexClean, '').trim();
            }

            // 解析基础信息
            const weekStr = fontElements.eq(0).text().replace(/周数：|周/g, '').trim();
            const weeks = parserWeeks(weekStr);
            
            const positionRaw = fontElements.eq(1).text().replace(/上课地点：/g, '').trim();
            const position = positionRaw.split(/\s+/).pop() || '';
            
            const teacher = fontElements.eq(2).text().replace(/教师\s*：/g, '').trim() || '';
            const sectionStr = tds.first().text().trim();
            const sections = parserSections(sectionStr);

            if (name && sections.length && weeks.length && teacher && position) {
                const data = {
                    name,
                    day: dayIndex,
                    weeks,
                    teacher,
                    position,
                    startSection: sections[0],
                    endSection: sections[sections.length - 1]
                };
                courseInfoList.push(data);
            }
        });
    });
    return courseInfoList;
}

/**
 * 解析节次数组 (1-2节 -> [1,2])
 */
function parserSections(str) {
    const [start, end] = str.split('-').map(Number);
    if (isNaN(start) || isNaN(end)) return [str]; // 兼容单节次
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * 解析周次 (支持 4-15周, 17周 或 4-15(单周))
 */
function parserWeeks(str) {
    if (!str) return [];
    const segments = str.split(',');
    let weeks = [];
    const regex = /(\d+)(?:-(\d+))?\s*(\([单双]\))?/g;

    for (const seg of segments) {
        const clean = seg.replace(/周/g, '').trim();
        let match;
        while ((match = regex.exec(clean)) !== null) {
            const s = parseInt(match[1]);
            const e = match[2] ? parseInt(match[2]) : s;
            const type = match[3] || '';

            for (let i = s; i <= e; i++) {
                if (type.includes('单') && i % 2 === 0) continue;
                if (type.includes('双') && i % 2 === 1) continue;
                if (!weeks.includes(i)) weeks.push(i);
            }
        }
    }
    return weeks.sort((a, b) => a - b);
}

/**
 * 主抓取逻辑
 */
async function scrapeAndParseCourses() {
    AndroidBridge.showToast("正在抓取 NEUQ 课表数据...");
    try {
        // 检测页面状态
        if (!document.querySelector('#kbgrid_table_0') && !document.querySelector('#kblist_table')) {
            await window.AndroidBridgePromise.showAlert("导入失败", "未检测到课表数据！\n请确认：1.已点击【查询】 2.页面已加载完成");
            return null;
        }

        // 自动识别视图类型 (优先表格，其次列表)
        let result = [];
        if (document.querySelector('#kbgrid_table_0')) {
            result = parserTable();
        } else if (document.querySelector('#kblist_table')) {
            result = parserList();
        } else {
            throw new Error("未找到课表主体元素");
        }

        if (result.length === 0) {
            AndroidBridge.showToast("解析结果为空，请检查学期设置");
            return null;
        }
        
        AndroidBridge.showToast(`解析成功：共 ${result.length} 门课程`);
        console.log("NEUQ 课表解析数据：", result);
        return { courses: result };
    } catch (error) {
        AndroidBridge.showToast(`解析失败：${error.message}`);
        console.error("NEUQ 解析错误：", error);
        await window.AndroidBridgePromise.showAlert("解析异常", `错误详情：${error.message}\n请刷新页面重试！`, "确定");
        return null;
    }
}

/**
 * 保存数据
 */
async function saveCourses(parsedCourses) {
    try {
        await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(parsedCourses));
        return true;
    } catch (e) {
        AndroidBridge.showToast("保存失败，请检查APP权限");
        console.error("保存错误：", e);
        return false;
    }
}

/**
 * 运行入口
 */
async function runImportFlow() {
    const tip = "使用须知：\n1. 登录 jwxt.neuq.edu.cn\n2. 进入【我的课表】\n3. 选择学年学期并点击【查询】\n4. 点击【一键导入】";
    
    const confirmed = await window.AndroidBridgePromise.showAlert("NEUQ 课表导入", tip, "开始导入");
    if (!confirmed) {
        AndroidBridge.showToast("用户取消导入");
        return;
    }

    // 检测 jQuery
    if (typeof window.jQuery === 'undefined') {
        await window.AndroidBridgePromise.showAlert("依赖缺失", "当前页面未加载 jQuery，请尝试刷新页面", "确定");
        return;
    }

    const data = await scrapeAndParseCourses();
    if (!data) return;

    const success = await saveCourses(data.courses);
    if (success) {
        AndroidBridge.showToast(`🎉 导入成功！共 ${data.courses.length} 门课程`);
        AndroidBridge.notifyTaskCompletion();
    }
}

// 启动
runImportFlow();
