import { getDb, initializeDatabase } from "./db";

export function seedDatabase(): void {
  initializeDatabase();
  const db = getDb();

  // Check if already seeded
  const count = db.prepare("SELECT COUNT(*) as c FROM companies").get() as { c: number };
  if (count.c > 0) return;

  const now = new Date().toISOString();

  // Company
  const companyId = "comp_001";
  db.prepare("INSERT INTO companies (id, name, phone, address, city, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(companyId, "装修管家装饰工程有限公司", "400-888-0000", "上海市浦东新区张江高科技园区", "上海市", now, now);

  // Users
  const users = [
    ["user_001", companyId, "李强", "13800000001", "liqiang@zxgj.com", null, "OWNER", 1],
    ["user_002", companyId, "陈刚", "13800000002", "chengang@zxgj.com", null, "PM", 1],
    ["user_003", companyId, "王刚", "13800000003", "wanggang@zxgj.com", null, "PM", 1],
    ["user_004", companyId, "赵丽", "13800000004", "zhaoli@zxgj.com", null, "DESIGNER", 1],
    ["user_005", companyId, "孙敏", "13800000005", "sunmin@zxgj.com", null, "DESIGNER", 1],
    ["user_006", companyId, "周婷", "13800000006", "zhouting@zxgj.com", null, "SALES", 1],
    ["user_007", companyId, "刘师傅", "13800000007", null, null, "ADMIN", 1],
    ["user_008", companyId, "王师傅", "13800000008", null, null, "ADMIN", 1],
    ["user_009", companyId, "陈师傅", "13800000009", null, null, "ADMIN", 1],
    ["user_010", companyId, "张师傅", "13800000010", null, null, "ADMIN", 1],
  ];
  const insertUser = db.prepare("INSERT INTO users (id, company_id, name, phone, email, password, role, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const u of users) insertUser.run(...u);

  // Customers
  const customers = [
    ["cust_001", companyId, "张伟", "138****1234", "浦东新区", null, "转介绍", "SIGNED", "已交接项目", "现代简约", 300000, 128, "user_006"],
    ["cust_002", companyId, "王芳", "139****5678", "南山区", null, "小程序", "SIGNED", "准备开工", "北欧风格", 200000, 95, "user_006"],
    ["cust_003", companyId, "李明", "137****9012", "西湖区", null, "广告投放", "SIGNED", "合同归档", "新中式", 450000, 168, "user_006"],
    ["cust_004", companyId, "陈丽", "136****3456", "天河区", null, "转介绍", "CONTACTED", "需求确认中", "轻奢风", 380000, 145, "user_006"],
    ["cust_005", companyId, "赵强", "135****7890", "高新区", null, "门店", "MEASURED", "方案制作中", "日式风格", 250000, 110, "user_006"],
    ["cust_006", companyId, "刘敏", "134****2345", "朝阳区", null, "转介绍", "NEW", "待首次联系", "现代轻奢", 600000, 200, "user_006"],
    ["cust_007", companyId, "黄磊", "133****6789", "南山区", null, "小程序", "SIGNED", "合同归档", "现代简约", 180000, 89, "user_006"],
    ["cust_008", companyId, "杨雪", "132****0123", "徐汇区", null, "广告投放", "MEASURED", "设计师已对接", "美式风格", 400000, 156, "user_006"],
  ];
  const insertCustomer = db.prepare("INSERT INTO customers (id, company_id, name, phone, area, address, source, status, current_action, intention, budget, area_size, created_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const c of customers) insertCustomer.run(...c);

  // Projects
  const projects = [
    ["proj_001", companyId, "cust_001", "user_001", "中海国际社区·张先生雅居", "上海市浦东新区中海国际社区3栋1202", 128, "现代简约", "CONSTRUCTION", 286000, "2026-04-15", "2026-08-15", null, 65, "MASONRY"],
    ["proj_002", companyId, "cust_002", "user_002", "万科城市花园·王女士新居", "深圳市南山区万科城市花园5栋801", 95, "北欧风格", "CONSTRUCTION", 198000, "2026-05-20", "2026-09-20", null, 30, "PLUMBING"],
    ["proj_003", companyId, "cust_003", "user_001", "龙湖天璞·李先生府邸", "杭州市西湖区龙湖天璞2栋1501", 168, "新中式", "SIGNED", 420000, "2026-07-01", "2026-12-01", null, 0, null],
    ["proj_004", companyId, "cust_004", "user_003", "保利天悦·陈女士雅居", "广州市天河区保利天悦8栋2203", 145, "轻奢风", "COMPLETED", 358000, "2026-01-10", "2026-05-10", "2026-05-08", 100, null],
    ["proj_005", companyId, "cust_005", "user_002", "绿城桂花城·赵先生新居", "成都市高新区绿城桂花城12栋501", 110, "日式风格", "QUOTED", 235000, null, null, null, 0, null],
    ["proj_006", companyId, "cust_006", "user_001", "融创壹号院·刘太太府邸", "北京市朝阳区融创壹号院9栋1801", 200, "现代轻奢", "LEAD", 560000, null, null, null, 0, null],
    ["proj_007", companyId, "cust_007", "user_003", "华润城润府·黄先生雅居", "深圳市南山区华润城润府3栋2802", 89, "现代简约", "CONSTRUCTION", 168000, "2026-03-01", "2026-07-01", null, 85, "PAINTING"],
    ["proj_008", companyId, "cust_008", "user_002", "仁恒滨河湾·杨女士新居", "上海市徐汇区仁恒滨河湾6栋901", 156, "美式风格", "DESIGNED", 385000, null, null, null, 0, null],
  ];
  const insertProject = db.prepare(`INSERT INTO projects (id, company_id, customer_id, manager_id, name, address, area, style, status, contract_amount, start_date, planned_end_date, actual_end_date, progress, current_phase) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const p of projects) insertProject.run(...p);

  // Tasks
  const tasks = [
    ["task_001", "proj_001", null, "墙体拆除", "DEMOLITION", "user_008", "COMPLETED", "HIGH", "2026-04-15", "2026-04-20"],
    ["task_002", "proj_001", null, "水电开槽布管", "PLUMBING", "user_009", "COMPLETED", "HIGH", "2026-04-21", "2026-05-05"],
    ["task_003", "proj_001", null, "防水工程", "PLUMBING", "user_009", "COMPLETED", "HIGH", "2026-05-06", "2026-05-10"],
    ["task_004", "proj_001", null, "墙面找平", "MASONRY", "user_008", "IN_PROGRESS", "MEDIUM", "2026-05-11", "2026-05-25"],
    ["task_005", "proj_001", null, "瓷砖铺贴", "MASONRY", "user_008", "PENDING", "HIGH", "2026-05-26", "2026-06-15"],
    ["task_006", "proj_001", null, "吊顶施工", "CARPENTRY", "user_010", "PENDING", "MEDIUM", "2026-06-16", "2026-06-30"],
    ["task_007", "proj_002", null, "水电定位", "PLUMBING", "user_009", "IN_PROGRESS", "HIGH", "2026-05-20", "2026-05-25"],
    ["task_008", "proj_002", null, "开槽布线", "PLUMBING", "user_009", "PENDING", "HIGH", "2026-05-26", "2026-06-08"],
  ];
  // Note: We don't have a phase_name column in the schema, so let me use notes instead
  const insertTaskCorrect = db.prepare(`INSERT INTO tasks (id, project_id, name, description, assignee_id, status, priority, planned_start, planned_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const t of tasks) insertTaskCorrect.run(t[0], t[1], t[2], t[3], t[5], t[6], t[7], t[8], t[9]);

  // Materials categories
  const matCats = [
    ["matcat_001", "瓷砖石材", null, 1],
    ["matcat_002", "地板木门", null, 2],
    ["matcat_003", "油漆涂料", null, 3],
    ["matcat_004", "卫浴洁具", null, 4],
    ["matcat_005", "定制柜类", null, 5],
    ["matcat_006", "电器五金", null, 6],
    ["matcat_007", "木作板材", null, 7],
  ];
  const insertMatCat = db.prepare("INSERT INTO material_categories (id, company_id, name, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)");
  for (const c of matCats) insertMatCat.run(c[0], companyId, c[1], c[2], c[3]);

  // Suppliers
  const insertSupplier = db.prepare("INSERT INTO suppliers (id, company_id, name, contact, phone) VALUES (?, ?, ?, ?, ?)");
  insertSupplier.run("supp_001", companyId, "诺贝尔建材", "王经理", "13900001001");
  insertSupplier.run("supp_002", companyId, "大自然地板", "李经理", "13900001002");
  insertSupplier.run("supp_003", companyId, "多乐士涂料", "张经理", "13900001003");
  insertSupplier.run("supp_004", companyId, "九牧卫浴", "陈经理", "13900001004");

  // Materials
  const materials = [
    ["mat_001", companyId, "matcat_001", "诺贝尔 瓷砖 800×800mm 浅灰", "诺贝尔", "瓷砖", "", "浅灰", "800×800mm", "片", 128, 85, "supp_001", 500, 50],
    ["mat_002", companyId, "matcat_002", "大自然 实木复合地板 橡木 1210×165×15mm", "大自然", "实木复合地板", "", "橡木", "1210×165×15mm", "㎡", 268, 180, "supp_002", 200, 30],
    ["mat_003", companyId, "matcat_003", "多乐士 抗甲醛五合一 18L/桶", "多乐士", "抗甲醛五合一", "", "", "18L/桶", "桶", 580, 420, "supp_003", 80, 10],
    ["mat_004", companyId, "matcat_004", "九牧 花洒套装 三出水 银色", "九牧", "花洒套装", "三出水", "银色", "", "套", 1280, 850, "supp_004", 30, 5],
    ["mat_005", companyId, "matcat_005", "欧派 橱柜定制套餐 3米地柜+1米吊柜", "欧派", "橱柜定制套餐", "", "", "3米地柜+1米吊柜", "套", 8800, 6500, null, 10, 2],
    ["mat_006", companyId, "matcat_006", "西门子 开关插座面板 皓彩系列 白色", "西门子", "开关插座面板", "皓彩系列", "白色", "", "个", 35, 22, null, 1000, 100],
    ["mat_007", companyId, "matcat_007", "兔宝宝 E0级生态板 2440×1220×18mm", "兔宝宝", "E0级生态板", "", "", "2440×1220×18mm", "张", 245, 178, null, 150, 20],
    ["mat_008", companyId, "matcat_004", "金牌 智能马桶 即热式 智能感应", "金牌", "智能马桶", "即热式", "智能感应", "", "台", 3999, 2800, null, 15, 3],
  ];
  const insertMaterial = db.prepare(`INSERT INTO materials (id, company_id, category_id, name, brand, product_name, material_model, color, spec, unit, unit_price, cost_price, supplier_id, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const m of materials) insertMaterial.run(...m);

  // Payment plans
  const paymentPlans = [
    ["pp_001", "proj_001", null, "签约首付款", "2026-04-15", 85800, "PAID", 1],
    ["pp_002", "proj_001", null, "水电验收款", "2026-05-10", 85800, "PAID", 2],
    ["pp_003", "proj_001", null, "竣工验收款", "2026-08-15", 114400, "PENDING", 3],
  ];
  const insertPP = db.prepare("INSERT INTO payment_plans (id, project_id, contract_id, milestone, due_date, amount, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const p of paymentPlans) insertPP.run(...p);

  // Daily logs
  const dailyLogs = [
    ["dl_001", "proj_001", "user_001", "2026-05-12", "晴", 28, "今日完成客厅墙面第一遍找平，明天开始第二遍。材料到场：水泥5袋、沙子10袋。", 4],
    ["dl_002", "proj_001", "user_001", "2026-05-13", "晴", 29, "墙面第二遍找平完成，明天开始养护。项目经理现场巡检，质量合格。", 3],
    ["dl_003", "proj_002", "user_002", "2026-05-22", "多云", 26, "水电定位完成，开始开槽。注意避开承重墙钢筋位置。", 3],
  ];
  const insertDL = db.prepare("INSERT INTO daily_logs (id, project_id, author_id, log_date, weather, temperature, content, worker_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const d of dailyLogs) insertDL.run(...d);

  console.log("Database seeded successfully!");
}

// Run if executed directly
if (require.main === module) {
  seedDatabase();
}
