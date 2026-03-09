// == NEUQ (jwxt.neuq.edu.cn) 课表导入脚本 ==
// 适用于 eams 系统「表格视图」课表页面
// 要求：用户已登录并点击【查询】加载出课表

/**
 * 等待指定元素出现在 DOM 中
 */
function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(selector);
        if (existing) return resolve(existing);

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`等待元素 ${selector} 超时`));
        }, timeout);
    });
}

/**
 * 解析周次字符串，如 "(4-15,17-18周)"
 */
function parseWeeks(weekStr) {
    if (!weekStr) return [];
    try {
        // 提取括号内内容，移除“周”字
        const match = weekStr.match(/\(([^)]+)\)/);
        if (!match) return [];
        let segments = match[1].replace(/周/g, '').split(/[,，]/);
        const weeks = new Set();

        for (let seg of segments) {
            seg = seg.trim();
            if (!seg) continue;
            if (seg.includes('-')) {
                const [start, end] = seg.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let w = start; w <= end; w++) weeks.add(w);
                }
            } else {
                const w = parseInt(seg);
                if (!isNaN(w)) weeks.add(w);
            }
        }
        return Array.from(weeks).sort((a, b) => a - b);
    } catch (e) {
        console.warn("解析周次失败:", weekStr, e);
        return [];
    }
}

/**
 * 解析节次范围，如 "1-2" 或 "3"
 */
function parseSections(sectionStr) {
    if (!sectionStr) return { start: 0, end: 0 };
    try {
        sectionStr = sectionStr.replace(/节/g, '').trim();
        if (sectionStr.includes('-')) {
            const [s, e] = sectionStr.split('-').map(Number);
            if (!isNaN(s) && !isNaN(e)) return { start: s, end: e };
        } else {
            const n = parseInt(sectionStr);
            if (!isNaN(n)) return { start: n, end: n };
        }
    } catch (e) {
        console.warn("解析节次失败:", sectionStr, e);
    }
    return { start: 0, end: 0 };
}

/**
 * 提取课程信息
 */
function extractCourseInfo(courseEl) {
    const cleanText = (str) => str?.replace(/[●★○\s]+/g, '').trim() || '';

    // 课程名称：通常在 <b> 标签内
    let name = cleanText(courseEl.querySelector('.title b')?.innerText);
    if (!name) {
        // 备用：第一个非空文本节点
        for (const node of courseEl.childNodes) {
            if (node.nodeType === 3 && node.textContent.trim()) {
                name = cleanText(node.textContent);
                break;
            }
        }
    }

    // 所有 <p> 文本
    const pTexts = Array.from(courseEl.querySelectorAll('p'))
        .map(p => p.innerText.trim())
        .filter(t => t && !/^[●★○\s]*$/.test(t));

    let weekSectionStr = '';
    let position = '';
    let teacher = '';

    for (const text of pTexts) {
        if (text.includes('周') && (text.includes('-') || text.includes(','))) {
            weekSectionStr = text;
        } else if (text.includes('馆') || text.includes('楼') || text.includes('教室')) {
            position = text;
        } else if (text.length > 1 && !position && text.includes('(') && text.includes(')')) {
            position = text;
        } else if (!teacher && text.length > 1 && !text.includes('周') && !text.includes('节')) {
            teacher = text;
        }
    }

    // 解析节次和周次
    const sections = parseSections(weekSectionStr);
    const weeks = parseWeeks(weekSectionStr);

    return {
        name,
        teacher: teacher || '未知教师',
        position: position || '未知地点',
        weeks,
        startSection: sections.start,
        endSection: sections.end
    };
}

/**
 * 解析整个课表
 */
function parseTimetable() {
    const courses = [];
    const table = document.getElementById('kbgrid_table_0');
    if (!table) {
        AndroidBridge.showToast("未找到课表表格，请确认已点击【查询】");
        return [];
    }

    // 遍历每天的单元格（周一到周日）
    table.querySelectorAll('td.td_wrap').forEach(td => {
        const id = td.getAttribute('id');
        if (!id) return;

        const dayMatch = id.match(/^(\d+)-/);
        const day = dayMatch ? parseInt(dayMatch[1]) : 0;
        if (day < 1 || day > 7) return;

        // 每个课程块
        td.querySelectorAll('.timetable_con.text-left').forEach(courseEl => {
            try {
                const info = extractCourseInfo(courseEl);
                if (info.name && info.weeks.length > 0 && info.startSection > 0) {
                    courses.push({
                        ...info,
                        day
                    });
                    console.log("✅ 解析课程:", info.name, { day, weeks: info.weeks, section: `${info.startSection}-${info.endSection}` });
                }
            } catch (e) {
                console.error("解析课程块失败:", e, courseEl);
            }
        });
    });

    return courses;
}

/**
 * 保存 NEUQ 作息时间（标准 12 节）
 */
async function saveTimeSlots() {
    const timeSlots = [
        { number: 1, startTime: "08:00", endTime: "08:45" },
        { number: 2, startTime: "08:55", endTime: "09:40" },
        { number: 3, startTime: "09:50", endTime: "10:35" },
        { number: 4, startTime: "10:45", endTime: "11:30" },
        { number: 5, startTime: "11:40", endTime: "12:25" },
        { number: 6, startTime: "14:30", endTime: "15:15" },
        { number: 7, startTime: "15:25", endTime: "16:10" },
        { number: 8, startTime: "16:20", endTime: "17:05" },
        { number: 9, startTime: "17:15", endTime: "18:00" },
        { number: 10, startTime: "19:00", endTime: "19:45" },
        { number: 11, startTime: "19:55", endTime: "20:40" },
        { number: 12, startTime: "20:50", endTime: "21:35" }
    ];
    await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(timeSlots));
}

/**
 * 保存学期配置（总周数）
 */
async function saveConfig() {
    const config = { semesterTotalWeeks: 20, firstDayOfWeek: 1 };
    await window.AndroidBridgePromise.saveCourseConfig(JSON.stringify(config));
}

/**
 * 主流程
 */
async function runImportFlow() {
    try {
        const confirmed = await window.AndroidBridgePromise.showAlert(
            "NEUQ 课表导入",
            "请确保：\n1. 已登录 jwxt.neuq.edu.cn\n2. 进入【我的课表】\n3. 点击【查询】加载课表\n是否继续？",
            "开始导入"
        );
        if (!confirmed) {
            AndroidBridge.showToast("用户取消");
            return;
        }

        // 等待课表加载
        AndroidBridge.showToast("等待课表加载...");
        await waitForElement('#kbgrid_table_0');

        // 解析课程
        const courses = parseTimetable();
        if (courses.length === 0) {
            AndroidBridge.showToast("未解析到任何课程，请检查课表是否显示");
            return;
        }

        // 保存数据
        await saveConfig();
        await saveTimeSlots();
        await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(courses));

        AndroidBridge.showToast(`🎉 导入成功！共 ${courses.length} 门课程`);
        AndroidBridge.notifyTaskCompletion();

    } catch (error) {
        console.error("导入失败:", error);
        AndroidBridge.showToast("导入失败: " + (error.message || error));
    }
}

// 启动
runImportFlow();
