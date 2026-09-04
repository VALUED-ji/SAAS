"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  HandCoins,
  HardHat,
  Loader2,
  MapPin,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import DataPagination, { useDataPagination } from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import styles from "./labor-settlement.module.css";

type SettlementType = "worker" | "manager" | "reimbursement" | "labor";
type SettlementStatus = "all" | "pending" | "approved" | "paying" | "paid" | "adjusting";
type StatusTone = "green" | "amber" | "red" | "blue" | "gray";

type CostItem = {
  label: string;
  amount: number;
  tone?: "default" | "red" | "amber" | "green";
};

type FlowItem = {
  label: string;
  time: string;
  operator: string;
};

type SettlementRecord = {
  id: string;
  no: string;
  type: SettlementType;
  targetName: string;
  targetRole: string;
  projectName: string;
  roomName: string;
  storeName: string;
  period: string;
  basis: string;
  payableAmount: number;
  deductionAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: Exclude<SettlementStatus, "all">;
  statusLabel: string;
  statusTone: StatusTone;
  updatedAt: string;
  handler: string;
  paymentMethod: string;
  note: string;
  costItems: CostItem[];
  flowItems: FlowItem[];
};

const settlementTypes: {
  key: SettlementType;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { key: "worker", label: "工人结算", description: "按工人、班组、工种核对应付人工费", icon: HardHat },
  { key: "manager", label: "项目经理结算", description: "按项目经理管理费、奖罚和节点核算", icon: UserRound },
  { key: "reimbursement", label: "人工报销", description: "现场人工垫付款和零星费用报销", icon: ReceiptText },
  { key: "labor", label: "劳务结算", description: "劳务班组或劳务公司统一对账", icon: UsersRound },
];

const statusFilters: { key: SettlementStatus; label: string; icon: LucideIcon; hint: string }[] = [
  { key: "all", label: "全部", icon: WalletCards, hint: "当前分类所有结算记录" },
  { key: "pending", label: "待审核", icon: Clock3, hint: "等待项目或财务复核" },
  { key: "approved", label: "待付款", icon: ShieldCheck, hint: "已审核，等待付款" },
  { key: "paying", label: "付款中", icon: HandCoins, hint: "已进入付款处理" },
  { key: "paid", label: "已结清", icon: CheckCircle2, hint: "当前结算已完成付款" },
  { key: "adjusting", label: "需调整", icon: FileText, hint: "金额或依据需要重新确认" },
];

const settlementRecords: SettlementRecord[] = [];

function money(value: number) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

function statusClass(tone: StatusTone) {
  if (tone === "green") return styles.statusGreen;
  if (tone === "amber") return styles.statusAmber;
  if (tone === "red") return styles.statusRed;
  if (tone === "blue") return styles.statusBlue;
  return styles.statusGray;
}

function amountToneClass(tone?: CostItem["tone"]) {
  if (tone === "green") return styles.amountGreen;
  if (tone === "red") return styles.amountRed;
  if (tone === "amber") return styles.amountAmber;
  return "";
}

function getTypeMeta(type: SettlementType) {
  return settlementTypes.find((item) => item.key === type) || settlementTypes[0];
}

function getStatusCount(records: SettlementRecord[], status: SettlementStatus) {
  if (status === "all") return records.length;
  return records.filter((item) => item.status === status).length;
}

function CategoryButton({
  type,
  active,
  onClick,
}: {
  type: (typeof settlementTypes)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = type.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.categoryButton} ${active ? styles.categoryButtonActive : ""}`}
      aria-pressed={active}
    >
      <span className={styles.categoryIcon}>
        <Icon className="h-4 w-4" />
      </span>
      <div className={styles.categoryText}>
        <span className={styles.categoryLabel}>{type.label}</span>
        <span className={styles.categoryDescription}>{type.description}</span>
      </div>
    </button>
  );
}

function AmountCell({ value, tone = "default" }: { value: number; tone?: "default" | "red" | "amber" | "green" }) {
  return <p className={`${styles.amountCell} ${amountToneClass(tone)}`}>{money(value)}</p>;
}

function DetailAmount({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "red" | "amber" | "green" }) {
  return (
    <div className={styles.detailAmount}>
      <p className={styles.detailAmountLabel}>{label}</p>
      <p className={`${styles.detailAmountValue} ${amountToneClass(tone)}`}>{money(value)}</p>
    </div>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`${styles.infoCell} ${wide ? styles.infoCellWide : ""}`}>
      <div className={styles.infoCellContent}>
        <span className={styles.infoIcon}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className={styles.infoLabel}>{label}</p>
          <p className={styles.infoValue} title={value}>
            {value || "-"}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyContent}>
        <span className={styles.emptyIcon}>
          <HandCoins className="h-5 w-5" />
        </span>
        <p className={styles.emptyText}>{text}</p>
      </div>
    </div>
  );
}

function SettlementDetailView({ record, onBack }: { record: SettlementRecord; onBack: () => void }) {
  const typeMeta = getTypeMeta(record.type);
  const Icon = typeMeta.icon;

  return (
    <div className={styles.detailWorkspace}>
      <section className={styles.panel}>
        <div className={styles.detailHeader}>
          <button type="button" onClick={onBack} className={styles.backButton} aria-label="返回结算列表" title="返回结算列表">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className={`${styles.statusBadge} ${statusClass(record.statusTone)}`}>{record.statusLabel}</span>
        </div>

        <div className={styles.detailOverview}>
          <div className={styles.detailIdentity}>
            <div className={styles.identityRow}>
              <span className={styles.identityIcon}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className={styles.identityName} title={record.targetName}>
                  {record.targetName}<span className={styles.identityRole}>{record.targetRole}</span>
                </h1>
                <p className={styles.identityMeta} title={record.no}>{typeMeta.label} · {record.no}</p>
                <div className={styles.identityMetrics}>
                  <div className={styles.identityMetric}>
                    <p className={styles.metricLabel}>结算周期</p>
                    <p className={styles.metricValue}>{record.period}</p>
                  </div>
                  <div className={styles.identityMetric}>
                    <p className={styles.metricLabel}>最近结算</p>
                    <p className={styles.metricValue}>{record.updatedAt}</p>
                  </div>
                  <div className={styles.identityMetric}>
                    <p className={styles.metricLabel}>经办人</p>
                    <p className={styles.metricValue}>{record.handler}</p>
                  </div>
                  <div className={styles.identityMetric}>
                    <p className={styles.metricLabel}>付款方式</p>
                    <p className={styles.metricValue}>{record.paymentMethod}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.infoGrid}>
              <InfoCell icon={MapPin} label="关联工地" value={record.roomName} />
              <InfoCell icon={Store} label="服务门店" value={record.storeName} />
              <InfoCell icon={CalendarDays} label="结算周期" value={record.period} />
              <InfoCell icon={UserRound} label="经办人" value={record.handler} />
              <InfoCell icon={FileText} label="结算依据" value={record.basis} wide />
              <InfoCell icon={FileText} label="备注说明" value={record.note || "-"} wide />
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.amountGrid}>
          <DetailAmount label="应结金额" value={record.payableAmount} />
          <DetailAmount label="扣款/调整" value={record.deductionAmount} tone={record.deductionAmount > 0 ? "amber" : "default"} />
          <DetailAmount label="已付金额" value={record.paidAmount} tone="green" />
          <DetailAmount label="剩余应付" value={record.remainingAmount} tone={record.remainingAmount > 0 ? "red" : "default"} />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>具体结算</h2>
            <p className={styles.sectionDescription}>该结算单的费用构成明细。</p>
          </div>
        </div>
        <ThinScrollArea>
          <table className={styles.detailTable}>
            <colgroup>
              <col style={{ width: 80 }} />
              <col style={{ width: 320 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 430 }} />
            </colgroup>
            <thead className={styles.tableHead}>
              <tr>
                <th className={`${styles.tableHeaderCell} text-center`}>序号</th>
                <th className={`${styles.tableHeaderCell} text-left`}>结算项</th>
                <th className={`${styles.tableHeaderCell} text-right`}>金额</th>
                <th className={`${styles.tableHeaderCell} text-left`}>说明</th>
              </tr>
            </thead>
            <tbody>
              {record.costItems.map((item, index) => (
                <tr key={`${item.label}-${index}`} className={styles.detailTableRow}>
                  <td className={`${styles.tableCell} text-center tabular-nums`}>
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td className={styles.tableCell}>
                    <p className={styles.primaryCell} title={item.label}>{item.label}</p>
                  </td>
                  <td className={styles.tableCell}>
                    <p className={`${styles.amountCell} ${amountToneClass(item.tone)}`}>
                      {item.amount < 0 ? "-" : ""}{money(Math.abs(item.amount))}
                    </p>
                  </td>
                  <td className={styles.tableCell}>
                    <span className={styles.mutedCell}>{item.amount < 0 ? "扣款或调整项" : "正常结算项"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ThinScrollArea>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>结算流水</h2>
            <p className={styles.sectionDescription}>该结算单的提交、审核和付款流转记录。</p>
          </div>
        </div>
        <ThinScrollArea>
          <table className={styles.detailTable}>
            <colgroup>
              <col style={{ width: 80 }} />
              <col style={{ width: 260 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 280 }} />
            </colgroup>
            <thead className={styles.tableHead}>
              <tr>
                <th className={`${styles.tableHeaderCell} text-center`}>序号</th>
                <th className={`${styles.tableHeaderCell} text-left`}>节点</th>
                <th className={`${styles.tableHeaderCell} text-center`}>操作人</th>
                <th className={`${styles.tableHeaderCell} text-center`}>时间</th>
                <th className={`${styles.tableHeaderCell} text-left`}>备注</th>
              </tr>
            </thead>
            <tbody>
              {record.flowItems.map((item, index) => (
                <tr key={`${item.label}-${item.time}`} className={styles.detailTableRow}>
                  <td className={`${styles.tableCell} text-center tabular-nums`}>
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td className={styles.tableCell}>
                    <p className={styles.primaryCell} title={item.label}>{item.label}</p>
                  </td>
                  <td className={`${styles.tableCell} text-center`}><span className={styles.mutedCell}>{item.operator}</span></td>
                  <td className={`${styles.tableCell} text-center`}><span className={styles.mutedCell}>{item.time}</span></td>
                  <td className={styles.tableCell}>
                    <span className={styles.mutedCell}>{index === record.flowItems.length - 1 ? record.statusLabel : "-"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ThinScrollArea>
      </section>
    </div>
  );
}

export default function LaborSettlementPage() {
  const [activeType, setActiveType] = useState<SettlementType>("worker");
  const [status, setStatus] = useState<SettlementStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return settlementRecords.filter((item) => {
      if (item.type !== activeType) return false;
      if (status !== "all" && item.status !== status) return false;
      if (!keyword) return true;
      return [
        item.no,
        item.targetName,
        item.targetRole,
        item.projectName,
        item.roomName,
        item.storeName,
        item.basis,
        item.handler,
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [activeType, search, status]);

  const pagination = useDataPagination(filteredRecords, [activeType, status, search].join("|"), 10);
  const recordsForActiveType = settlementRecords.filter((item) => item.type === activeType);
  const selectedRecord = selectedId ? settlementRecords.find((item) => item.id === selectedId) || null : null;

  if (selectedRecord) {
    return (
      <main className={styles.page}>
        <SettlementDetailView record={selectedRecord} onBack={() => setSelectedId("")} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.workspace}>
        <header className={styles.pageHeader}>
          <div className={styles.pageIdentity}>
            <span className={styles.pageIcon}>
              <HandCoins className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className={styles.pageTitle}>人工结算</h1>
              <p className={styles.pageSubtitle}>一条结算一行，点击结算记录查看具体明细。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              window.setTimeout(() => setRefreshing(false), 500);
            }}
            className={styles.refreshButton}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{refreshing ? "刷新中" : "刷新"}</span>
          </button>
        </header>

        <section className={styles.viewPanel}>
          <div className={styles.categoryScroller}>
            <nav className={styles.categoryNav} aria-label="结算分类">
              {settlementTypes.map((item) => (
                <CategoryButton
                  key={item.key}
                  type={item}
                  active={item.key === activeType}
                  onClick={() => {
                    setActiveType(item.key);
                    setStatus("all");
                    setSelectedId("");
                  }}
                />
              ))}
            </nav>
          </div>
        </section>

        <section className={styles.listPanel}>
          <div className={styles.toolbar}>
            <nav className={`${styles.statusNav} system-status-segmented`} aria-label="结算状态筛选">
              {statusFilters.map((item) => {
                const Icon = item.icon;
                const active = status === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    title={item.hint}
                    onClick={() => {
                      setStatus(item.key);
                      setSelectedId("");
                    }}
                    className={`${styles.statusButton} system-status-option ${active ? `${styles.statusButtonActive} system-status-option-active` : ""}`}
                    aria-pressed={active}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                    <span className={`${styles.statusCount} system-status-count`}>{getStatusCount(recordsForActiveType, item.key)}</span>
                  </button>
                );
              })}
            </nav>
            <div className={styles.toolbarTools}>
              <label className={styles.searchField}>
                <Search className={styles.searchIcon} />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelectedId("");
                  }}
                  className={styles.searchInput}
                  placeholder="搜索对象、工地、单据"
                />
              </label>
            </div>
          </div>
          {filteredRecords.length === 0 ? (
            <EmptyState text="当前分类和状态下暂无人工结算记录" />
          ) : (
            <>
              <ThinScrollArea className={styles.tableScroll}>
                <table className={styles.table}>
                  <colgroup>
                    <col style={{ width: 64 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 230 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 230 }} />
                    <col style={{ width: 126 }} />
                    <col style={{ width: 126 }} />
                    <col style={{ width: 126 }} />
                    <col style={{ width: 126 }} />
                    <col style={{ width: 106 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 112 }} />
                  </colgroup>
                  <thead className={styles.tableHead}>
                    <tr>
                      <th className={`${styles.tableHeaderCell} text-center`}>序号</th>
                      <th className={`${styles.tableHeaderCell} text-left`}>单据编号</th>
                      <th className={`${styles.tableHeaderCell} text-left`}>结算对象</th>
                      <th className={`${styles.tableHeaderCell} text-left`}>关联工地</th>
                      <th className={`${styles.tableHeaderCell} text-center`}>服务门店</th>
                      <th className={`${styles.tableHeaderCell} text-center`}>结算周期</th>
                      <th className={`${styles.tableHeaderCell} text-left`}>结算依据</th>
                      <th className={`${styles.tableHeaderCell} text-right`}>应结金额</th>
                      <th className={`${styles.tableHeaderCell} text-right`}>扣款/调整</th>
                      <th className={`${styles.tableHeaderCell} text-right`}>已付金额</th>
                      <th className={`${styles.tableHeaderCell} text-right`}>剩余应付</th>
                      <th className={`${styles.tableHeaderCell} text-center`}>状态</th>
                      <th className={`${styles.tableHeaderCell} text-center`}>最近结算</th>
                      <th className={`${styles.tableHeaderCell} text-center`}>经办人</th>
                      <th className={`${styles.tableHeaderCell} text-center`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.pageItems.map((record, index) => (
                      <tr
                        key={record.id}
                        onClick={() => setSelectedId(record.id)}
                        className={styles.tableRow}
                      >
                        <td className={`${styles.tableCell} text-center tabular-nums`}>
                          {String((pagination.page - 1) * pagination.pageSize + index + 1).padStart(2, "0")}
                        </td>
                        <td className={styles.tableCell}>
                          <p className={styles.primaryCell} title={record.no}>{record.no}</p>
                        </td>
                        <td className={styles.tableCell}>
                          <p className={styles.primaryCell} title={record.targetName}>{record.targetName}</p>
                          <p className={styles.secondaryCell}>{record.targetRole}</p>
                        </td>
                        <td className={styles.tableCell}>
                          <p className={styles.primaryCell} title={record.roomName}>{record.roomName}</p>
                          <p className={styles.secondaryCell} title={record.projectName}>{record.projectName}</p>
                        </td>
                        <td className={`${styles.tableCell} text-center`}>
                          <span className={styles.mutedCell} title={record.storeName}>{record.storeName}</span>
                        </td>
                        <td className={`${styles.tableCell} text-center`}><span className={styles.mutedCell}>{record.period}</span></td>
                        <td className={styles.tableCell}>
                          <p className={styles.mutedCell} title={record.basis}>{record.basis}</p>
                        </td>
                        <td className={styles.tableCell}><AmountCell value={record.payableAmount} /></td>
                        <td className={styles.tableCell}><AmountCell value={record.deductionAmount} tone={record.deductionAmount > 0 ? "amber" : "default"} /></td>
                        <td className={styles.tableCell}><AmountCell value={record.paidAmount} tone="green" /></td>
                        <td className={styles.tableCell}><AmountCell value={record.remainingAmount} tone={record.remainingAmount > 0 ? "red" : "default"} /></td>
                        <td className={`${styles.tableCell} text-center`}>
                          <span className={`${styles.statusBadge} ${statusClass(record.statusTone)}`}>{record.statusLabel}</span>
                        </td>
                        <td className={`${styles.tableCell} text-center`}><span className={styles.mutedCell}>{record.updatedAt}</span></td>
                        <td className={`${styles.tableCell} text-center`}>
                          <span className={styles.mutedCell} title={record.handler}>{record.handler}</span>
                        </td>
                        <td className={`${styles.tableCell} text-center`}>
                          <span className={styles.viewButton}>
                            查看明细
                            <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ThinScrollArea>
              <DataPagination
                total={filteredRecords.length}
                page={pagination.page}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                itemName="条结算"
                className={styles.pagination}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
