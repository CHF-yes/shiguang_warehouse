/**
 * 拾光课表 - 东北大学秦皇岛分校 (NEUQ) 正方教务系统适配器
 * 适配网址: jwxt.neuq.edu.cn
 * 视图类型: Grid (表格视图)
 * 解析器入口: parseNEUQGrid
 */

(function(window) {
    'use strict';

    /**
     * 解析节次
     * @param {string} str - 节次字符串，如 "1-2"
     * @returns {number[]} 节次数组
     */
    function parserSections(str) {
        try {
            const [start, end] = str.replace(/节/g, "").split("-").map(Number);
            if (isNaN(start) || isNaN(end) || start > end) return [];
            return Array.from({ length: end - start + 1 }, (_, i) => start + i);
        } catch (e) {
            return [];
        }
    }

    /**
     * 解析周次
     * 支持格式: "1-16周"、"3-18"、"单周(1-15)"、"双周(2-16)"
     * @param {string} str - 周次描述字符串
     * @returns {number[]} 去重并排序后的周次数组
     */
    function parserWeeks(str) {
        const weeks = [];
        if (!str || typeof str !== 'string') return weeks;

        // 清理字符串，移除所有中文和括号，只保留数字、- 和 单双标记
        const cleanStr = str.replace(/[周()（）]/g, "").trim();
        const segments = cleanStr.split(/[,，]/);
        const segmentRegex = /(\d+)(?:-(\d+))?\s*(单|双)?/;

        for (const seg of segments) {
            const match = seg.match(segmentRegex);
            if (!match) continue;

            const start = parseInt(match[1]);
            const end = match[2] ? parseInt(match[2]) : start;
            const type = match[3] || '';

            // 边界保护
            if (isNaN(start) || isNaN(end) || start > end || start < 1 || end > 30) continue;

            for (let i = start; i <= end; i++) {
                // 单双周过滤
                if (type === '单' && i % 2 === 0) continue;
                if (type === '双' && i % 2 === 1) continue;
                // 去重
                if (!weeks.includes(i)) weeks.push(i);
            }
        }

        return weeks.sort((a, b) => a - b);
    }

    /**
     * 合并连续节次的课程
     * NEUQ的表格布局是单节td，需要合并连堂课
     * @param {Array} courseList - 原始课程列表
     * @returns {Array} 合并后的课程列表
     */
    function mergeContinuousSections(courseList) {
        if (!Array.isArray(courseList) || courseList.length === 0) return [];

        // 先按星期和开始节次排序
        const sortedList = [...courseList].sort((a, b) => {
            if (a.day !== b.day) return a.day - b.day;
            return a.startSection - b.startSection;
        });

        const mergedList = [sortedList[0]];

        for (let i = 1; i < sortedList.length; i++) {
            const lastCourse = mergedList[mergedList.length - 1];
            const currentCourse = sortedList[i];

            // 判定条件：同天、同名、同老师、同周次、且节次连续
            const isContinuous = (
                lastCourse.day === currentCourse.day &&
                lastCourse.name === currentCourse.name &&
                lastCourse.teacher === currentCourse.teacher &&
                JSON.stringify(lastCourse.weeks) === JSON.stringify(currentCourse.weeks) &&
                lastCourse.endSection + 1 === currentCourse.startSection
            );

            if (isContinuous) {
                // 合并节次
                lastCourse.endSection = currentCourse.endSection;
            } else {
                // 新增课程
                mergedList.push(currentCourse);
            }
        }

        return mergedList;
    }

    /**
     * NEUQ 表格视图核心解析器
     * 这是框架调用的入口函数
     * @returns {Array} 标准课程信息数组
     */
    function parseNEUQGrid() {
        const courseInfoList = [];
        const $ = window.jQuery;

        // 环境检查
        if (typeof $ === 'undefined') {
            console.error('[NEUQ Parser] jQuery 未加载，解析失败');
            return courseInfoList;
        }

        // 检查核心DOM是否存在
        const $mainTable = $('#mainTable');
        if (!$mainTable.length) {
            console.error('[NEUQ Parser] 未找到课表容器 #mainTable');
            return courseInfoList;
        }

        // 遍历所有课程单元格
        $mainTable.find('td.td_wrap').each((_, td) => {
            const $td = $(td);
            const cellId = $td.attr('id');
            const cellText = $td.text().trim();

            // 过滤空单元格和无ID单元格
            if (!cellId || !cellText) return;

            // --- 1. 解析 星期(day) 和 节次(section) ---
            // NEUQ的TD ID格式为: 1_1 (星期一, 第一节), 3_5 (星期三, 第五节)
            const idParts = cellId.split('_');
            if (idParts.length !== 2) return;

            const day = parseInt(idParts[0]);
            const currentSection = parseInt(idParts[1]);

            // 数据合法性校验
            if (isNaN(day) || isNaN(currentSection) || day < 1 || day > 7 || currentSection < 1) {
                return;
            }

            // --- 2. 解析 课程详情 ---
            // NEUQ 标准格式: 人工智能导论(30301130702) (李王霞); (1-16周, 4-15,工学馆311(学校本部))
            // 捕获组: 1-课程名, 2-教师, 3-周次信息, 4-教室信息
            const courseRegex = /([^(]+)\(\d+\)\s*\(([^)]+)\);\s*\(([^,]+),\s*([^)]+)\)/;
            const match = cellText.match(courseRegex);

            if (!match) {
                // 兼容可能的极简格式（部分学校可能有变体）
                console.warn(`[NEUQ Parser] 无法解析单元格内容: ${cellText}`);
                return;
            }

            const rawName = match[1] || '';
            const teacher = (match[2] || '').trim();
            const weekStr = (match[3] || '').trim();
            const rawPosition = (match[4] || '').trim();

            // --- 3. 清洗数据 ---
            // 移除课程名中的特殊符号 (●★○)
            const name = rawName.replace(/[●★○]/g, '').trim();
            // 解析周次
            const weeks = parserWeeks(weekStr);
            // 清理教室名称（移除 "(学校本部)" 等后缀）
            const position = rawPosition.replace(/\(.*\)/, '').trim().split(/\s+/).pop() || rawPosition;

            // --- 4. 最终校验并入库 ---
            if (name && teacher && weeks.length > 0 && position) {
                courseInfoList.push({
                    name: name,
                    day: day,
                    weeks: weeks,
                    teacher: teacher,
                    position: position,
                    startSection: currentSection,
                    endSection: currentSection // 先默认单节，后续合并
                });
            }
        });

        // --- 5. 合并连堂课 ---
        const finalCourses = mergeContinuousSections(courseInfoList);
        console.log(`[NEUQ Parser] 解析完成，原始课程${courseInfoList.length}节，合并后${finalCourses.length}门`);
        
        return finalCourses;
    }

    // --- 框架导出接口 ---
    // 将解析器挂载到 window，供拾光课表 Native 层调用
    window.__SHIGUANG_PARSER__ = window.__SHIGUANG_PARSER__ || {};
    // 注册解析器，与 adapters.yaml 中的 parser 字段对应
    window.__SHIGUANG_PARSER__.parseNEUQGrid = parseNEUQGrid;

})(window);
