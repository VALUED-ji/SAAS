# 全系统 UI v2 升级清单

日期：2026-07-27

## 升级目标

- 将剩余后台页面统一到现代装修行业 SaaS 产品界面。
- 保持所有 API、数据结构、权限、数据范围和业务操作不变。
- 使用统一 Token、表格、表单、弹窗、空状态和交互状态。
- 保留已完成页面，避免重复改造造成回归。

## 页面范围

- 列表工作台：待办、报价合同、工地、财务、材料、订单、定额、组织、团队、角色、供应商、分公司。
- 详情工作台：客户详情、工地详情、分公司详情。
- 设置工作台：个人设置、系统设置、材料设置、分公司设置。
- 复杂编辑器：报价编辑、定额模板编辑。
- 后台弹窗：页面内弹窗、审批签名、材料/订单选择器、系统下拉浮层。

## 保护范围

- `/dashboard`
- `/group-dashboard`
- `/projects`（仅客户列表；客户详情纳入本轮）
- `Sidebar`
- 登录与公开移动端页面

## 技术落地

- 路由作用域：`DashboardLayout.tsx` 根据路径写入 `data-system-ui` 与工作台类型。
- 全局规范：`src/app/system-ui.css`。
- 复用组件：`src/components/ui/system-ui.tsx`。
- 共享控件：`SystemSelect`、`DataPagination`、`DetailInfoField`、`RouteLoading`。

## 回滚

完整 UI 快照：

`/Users/jizhangjun/Documents/Codex/2026-06-12/backups/saas-ui-before-system-v2-20260727-025934.tar.gz`

SHA-256：

`31cfdc7324b8fa54785bc4904f04615f693d21ede7d46495fd672eb7600c8336`

回滚时应先停止本地服务，再将压缩包解压覆盖当前项目中的 `src`、`docs`、`tailwind.config.ts` 和 `package.json`。不得使用 `git reset --hard`。
