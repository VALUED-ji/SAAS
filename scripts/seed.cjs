const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db');
console.log('DB path:', dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Read and apply schema from db.ts
const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'db.ts'), 'utf8');
const start = content.indexOf('const SCHEMA_SQL = `');
const end = content.indexOf('`;', start);
let sql = content.substring(start + 19, end);
if (sql.startsWith('`')) sql = sql.substring(1);

console.log('Applying schema...');
try {
  db.exec(sql);
} catch(e) {
  console.log('Schema error:', e.message.substring(0, 200));
  process.exit(1);
}
console.log('Schema applied');

// Check if already seeded
const count = db.prepare('SELECT COUNT(*) as c FROM companies').get();
if (count.c > 0) {
  console.log('Already seeded (' + count.c + ' companies), skipping');
  db.close();
  process.exit(0);
}

const now = new Date().toISOString();
const cid = 'comp_001';

db.prepare('INSERT INTO companies (id,name,phone,address,city,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
  .run(cid,'装修管家装饰工程有限公司','400-888-0000','上海市浦东新区','上海市',now,now);

const users=[['u1',cid,'李强','13800000001','liqiang@zxgj.com',null,'OWNER'],['u2',cid,'陈刚','13800000002','chengang@zxgj.com',null,'PM'],['u3',cid,'王刚','13800000003','wanggang@zxgj.com',null,'PM'],['u4',cid,'赵丽','13800000004','zhaoli@zxgj.com',null,'DESIGNER'],['u5',cid,'孙敏','13800000005','sunmin@zxgj.com',null,'DESIGNER'],['u6',cid,'周婷','13800000006','zhouting@zxgj.com',null,'SALES'],['u7',cid,'刘师傅','13800000007',null,null,'ADMIN'],['u8',cid,'王师傅','13800000008',null,null,'ADMIN'],['u9',cid,'陈师傅','13800000009',null,null,'ADMIN'],['u10',cid,'张师傅','13800000010',null,null,'ADMIN']];
const iu=db.prepare('INSERT INTO users(id,company_id,name,phone,email,password,role,is_active)VALUES(?,?,?,?,?,?,?,1)');
for(const u of users)iu.run(...u);
console.log('Users done');

const custs=[['c1',cid,'张伟','138****1234','浦东新区','转介绍','SIGNED','现代简约',300000,128,'u6'],['c2',cid,'王芳','139****5678','南山区','小程序','SIGNED','北欧风格',200000,95,'u6'],['c3',cid,'李明','137****9012','西湖区','广告投放','SIGNED','新中式',450000,168,'u6'],['c4',cid,'陈丽','136****3456','天河区','转介绍','CONTACTED','轻奢风',380000,145,'u6'],['c5',cid,'赵强','135****7890','高新区','门店','VISITED','日式风格',250000,110,'u6'],['c6',cid,'刘敏','134****2345','朝阳区','转介绍','NEW','现代轻奢',600000,200,'u6'],['c7',cid,'黄磊','133****6789','南山区','小程序','SIGNED','现代简约',180000,89,'u6'],['c8',cid,'杨雪','132****0123','徐汇区','广告投放','VISITED','美式风格',400000,156,'u6']];
const ic=db.prepare('INSERT INTO customers(id,company_id,name,phone,area,source,status,intention,budget,area_size,created_by_id)VALUES(?,?,?,?,?,?,?,?,?,?,?)');
for(const c of custs)ic.run(...c);
console.log('Customers done');

const projs=[['p1',cid,'c1','u1','中海国际社区·张先生雅居',128,'现代简约','CONSTRUCTION',286000,'2026-04-15','2026-08-15',65,'MASONRY'],['p2',cid,'c2','u2','万科城市花园·王女士新居',95,'北欧风格','CONSTRUCTION',198000,'2026-05-20','2026-09-20',30,'PLUMBING'],['p3',cid,'c3','u1','龙湖天璞·李先生府邸',168,'新中式','SIGNED',420000,'2026-07-01','2026-12-01',0,null],['p4',cid,'c4','u3','保利天悦·陈女士雅居',145,'轻奢风','COMPLETED',358000,'2026-01-10','2026-05-10',100,null],['p5',cid,'c5','u2','绿城桂花城·赵先生新居',110,'日式风格','QUOTED',235000,null,null,0,null],['p6',cid,'c6','u1','融创壹号院·刘太太府邸',200,'现代轻奢','LEAD',560000,null,null,0,null],['p7',cid,'c7','u3','华润城润府·黄先生雅居',89,'现代简约','CONSTRUCTION',168000,'2026-03-01','2026-07-01',85,'PAINTING'],['p8',cid,'c8','u2','仁恒滨河湾·杨女士新居',156,'美式风格','DESIGNED',385000,null,null,0,null]];
const ip=db.prepare('INSERT INTO projects(id,company_id,customer_id,manager_id,name,area,style,status,contract_amount,start_date,planned_end_date,progress,current_phase)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
for(const p of projs)ip.run(...p);
console.log('Projects done');

const tasks=[['t1','p1','墙体拆除','u8','COMPLETED','HIGH','2026-04-15','2026-04-20'],['t2','p1','水电开槽布管','u9','COMPLETED','HIGH','2026-04-21','2026-05-05'],['t3','p1','防水工程','u9','COMPLETED','HIGH','2026-05-06','2026-05-10'],['t4','p1','墙面找平','u8','IN_PROGRESS','MEDIUM','2026-05-11','2026-05-25'],['t5','p1','瓷砖铺贴','u8','PENDING','HIGH','2026-05-26','2026-06-15'],['t6','p1','吊顶施工','u10','PENDING','MEDIUM','2026-06-16','2026-06-30'],['t7','p2','水电定位','u9','IN_PROGRESS','HIGH','2026-05-20','2026-05-25'],['t8','p2','开槽布线','u9','PENDING','HIGH','2026-05-26','2026-06-08']];
const it=db.prepare('INSERT INTO tasks(id,project_id,name,assignee_id,status,priority,planned_start,planned_end)VALUES(?,?,?,?,?,?,?,?)');
for(const t of tasks)it.run(...t);
console.log('Tasks done');

// Material categories
for(const c of[['mc1','瓷砖',1],['mc2','地板',2],['mc3','涂料',3],['mc4','卫浴',4],['mc5','橱柜',5],['mc6','开关',6],['mc7','板材',7]]){
  db.prepare('INSERT INTO material_categories(id,name,sort_order)VALUES(?,?,?)').run(...c);
}
// Suppliers
db.prepare('INSERT INTO suppliers(id,company_id,name,contact,phone)VALUES(?,?,?,?,?)').run('s1',cid,'诺贝尔建材','王经理','13900001001');
db.prepare('INSERT INTO suppliers(id,company_id,name,contact,phone)VALUES(?,?,?,?,?)').run('s2',cid,'大自然地板','李经理','13900001002');
// Materials
const mats=[['m1',cid,'mc1','诺贝尔瓷砖800×800','诺贝尔','800×800mm','片',128,85,null,500,50],['m2',cid,'mc2','大自然实木复合地板','大自然','1210×165×15mm','㎡',268,180,null,200,30],['m3',cid,'mc3','多乐士抗甲醛五合一','多乐士','18L/桶','桶',580,420,null,80,10],['m4',cid,'mc4','九牧卫浴花洒套装','九牧','三出水银色','套',1280,850,null,30,5],['m5',cid,'mc5','欧派橱柜定制套餐','欧派','3米地柜+1米吊柜','套',8800,6500,null,10,2],['m6',cid,'mc6','西门子开关插座面板','西门子','皓彩白色','个',35,22,null,1000,100],['m7',cid,'mc7','兔宝宝E0级生态板','兔宝宝','2440×1220×18mm','张',245,178,null,150,20],['m8',cid,'mc4','金牌卫浴智能马桶','金牌','即热式智能感应','台',3999,2800,null,15,3]];
const im=db.prepare('INSERT INTO materials(id,company_id,category_id,name,brand,spec,unit,unit_price,cost_price,supplier_id,stock,min_stock)VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
for(const m of mats)im.run(...m);
console.log('Materials done');

// Payment plans
for(const p of[['pp1','p1','签约首付款','2026-04-15',85800,'PAID',1],['pp2','p1','水电验收款','2026-05-10',85800,'PAID',2],['pp3','p1','竣工验收款','2026-08-15',114400,'PENDING',3]]){
  db.prepare('INSERT INTO payment_plans(id,project_id,milestone,due_date,amount,status,sort_order)VALUES(?,?,?,?,?,?,?)').run(...p);
}
// Daily logs
for(const d of[['dl1','p1','u1','2026-05-12','晴',28,'今日完成客厅墙面找平',4],['dl2','p1','u1','2026-05-13','晴',29,'墙面第二遍找平完成',3],['dl3','p2','u2','2026-05-22','多云',26,'水电定位完成，开始开槽',3]]){
  db.prepare('INSERT INTO daily_logs(id,project_id,author_id,log_date,weather,temperature,content,worker_count)VALUES(?,?,?,?,?,?,?,?)').run(...d);
}
console.log('Daily logs done');

db.close();
console.log('========================================');
console.log('Database seeded successfully!');
