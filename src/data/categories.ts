/**
 * 全站分类清单 —— 这里是分类的唯一定义处，改这个文件就能维护分类。
 *
 * 怎么用：
 * 1. 新增分类：在数组里加一项 `{ name: "分类名" }`，保存后右侧栏、
 *    /categories/ 总览页、分类归档页会自动出现，**不需要改任何页面代码**。
 *    还没写文章的分类也会显示（计数为 0），适合先把框架定下来。
 * 2. 改名：直接改 `name`。注意 URL 会跟着变，旧链接会失效。
 * 3. 删除：从数组里删掉。如果还有文章写着这个分类，它会自动补在列表末尾，
 *    不会丢文章 —— 建议同时把那些文章的 `category` 改掉。
 * 4. 排序：数组顺序就是侧栏和总览页的显示顺序，把常用的放前面。
 *
 * 写文章时在 frontmatter 里写 `category: "分类名"`，必须和这里的 name 完全一致
 * （包括空格），否则会被当成一个未登记的新分类追加到列表最后。
 *
 * description 只显示在 /categories/ 总览页，可不填。
 */
export type CategoryDefinition = {
  /** 分类名，同时用于 URL，例如 "开发笔记" -> /categories/开发笔记/ */
  name: string;
  /**
   * 可选的 URL 片段。不填就按 name 自动生成（中文保留中文，空格转成 -）。
   * 填了就固定用这个，例如 `{ name: "AI 应用", slug: "ai" }` -> /categories/ai/
   * 已发布的分类不建议改 slug，否则旧链接会 404。
   */
  slug?: string;
  /** 一句话说明，显示在分类总览页 */
  description?: string;
};

export const categoryDefinitions: CategoryDefinition[] = [
  { name: "开发笔记", description: "前端、后端、框架与语言特性" },
  { name: "数据库与性能", description: "SQL、批处理、调优与容量问题" },
  { name: "运维部署", description: "服务器、中间件、上线与线上排障" },
  { name: "项目复盘", description: "项目落地过程、协作与踩坑总结" },
  { name: "AI 应用", slug: "ai", description: "大模型、智能体与业务落地" },
  { name: "工具与效率", description: "开发工具、自动化脚本与工作流" },
  { name: "生活随笔", description: "读书、思考与日常记录" },
];
