"use client";

import { contractWorkforceCoverage } from "@/lib/contract-workforce-coverage";
import { resolveWorkerContractPlacement } from "@/lib/worker-contract-placement";
import WorkerIncidentsPanel from "./WorkerIncidentsPanel";
import { useMemo, useState } from "react";

type Contract = {
  id: number;
  referenceCode: string;
  clientName: string;
  title: string;
  workSite: string;
  startDate: string;
  endDate: string;
  status: string;
  quantityMode?: string;
};
type Profession = {
  id: number;
  contractId: number;
  profession: string;
  requiredCount: number;
  sponsorshipType: string | null;
  sponsorName: string | null;
};
type Assignment = {
  id: number;
  contractId: number;
  contractProfessionId: number;
  workerId: number;
  status: string;
  assignedAt?: string;
};
type Worker = {
  id: number;
  workerNumber?: string;
  iqamaNumber?: string | null;
  fullName: string;
  nationality?: string;
  profession: string;
  sponsorshipType?: string;
  sponsorName?: string | null;
  beneficiaryName?: string | null;
  clientSite: string;
  status: string;
  archivedAt?: string | null;
};

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  internal_review: "مراجعة داخلية",
  legal_review: "مراجعة قانونية",
  approved: "معتمد",
  sent: "مرسل",
  signed: "موقّع",
  active: "ساري",
  suspended: "معلّق",
  expired: "منتهي",
  terminated: "منهى",
  cancelled: "ملغى",
  superseded: "مستبدل",
};
const workerStatusLabels: Record<string, string> = {
  available: "متاح",
  assigned: "مسند",
  leave: "إجازة",
  suspended: "موقوف",
};

function sponsorshipMatches(worker: Worker, profession: Profession) {
  if (!profession.sponsorshipType) return true;
  if (worker.sponsorshipType !== profession.sponsorshipType) return false;
  return profession.sponsorshipType !== "other" ||
    !profession.sponsorName ||
    worker.sponsorName === profession.sponsorName;
}

export default function WorkforceSupervisionWorkspace({
  selectedIncidentId,
  contracts,
  professions,
  assignments,
  workers,
  canManage,
  busy,
  onOpenContract,
  onAssign,
  onRelease,
  onWorkerStatus,
}: {
  selectedIncidentId?:number|null;
  contracts: Contract[];
  professions: Profession[];
  assignments: Assignment[];
  workers: Worker[];
  canManage: boolean;
  busy: string | null;
  onOpenContract: (id: number) => void;
  onAssign: (
    contractId: number,
    contractProfessionId: number,
    workerId: number,
  ) => Promise<void>;
  onRelease: (contractId: number, assignmentId: number) => Promise<void>;
  onWorkerStatus: (workerId: number, status: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [coverage, setCoverage] = useState<"all" | "shortage" | "complete">(
    "all",
  );
  const [expandedContractId, setExpandedContractId] = useState<number | null>(
    null,
  );
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [workerQuery, setWorkerQuery] = useState("");
  const [workerStatus, setWorkerStatus] = useState("all");

  const operational = useMemo(
    () =>
      contracts
        .filter(
          (contract) =>
            !["terminated", "cancelled", "superseded"].includes(
              contract.status,
            ),
        )
        .map((contract) => {
          const requirements = professions.filter(
            (item) => item.contractId === contract.id,
          );
          const required = requirements.reduce(
            (sum, item) => sum + item.requiredCount,
            0,
          );
          const active = assignments.filter(
            (item) => item.contractId === contract.id && item.status === "active",
          );
          const assignedWorkers = workers.filter((worker) =>
            active.some((item) => item.workerId === worker.id),
          );
          const coverage = contractWorkforceCoverage(requirements, active, contract.quantityMode === "open");
          const shortage = coverage.shortage;
          const percent = coverage.percent ?? 0;
          return {
            contract,
            requirements,
            required,
            active,
            assignedWorkers,
            shortage,
            percent,
          };
        }),
    [contracts, professions, assignments, workers],
  );
  const filtered = operational.filter((row) => {
    const haystack = `${row.contract.referenceCode} ${row.contract.clientName} ${row.contract.title} ${row.contract.workSite}`.toLowerCase();
    return (
      (!query.trim() || haystack.includes(query.trim().toLowerCase())) &&
      (coverage === "all" ||
        (coverage === "shortage" ? row.shortage > 0 : row.shortage === 0))
    );
  });
  const visibleWorkers = workers.filter((worker) => {
    if (worker.archivedAt) return false;
    const placement = resolveWorkerContractPlacement(worker.id, assignments, contracts, worker.clientSite);\n    const haystack = `${worker.workerNumber || ""} ${worker.iqamaNumber || ""} ${worker.fullName} ${worker.profession} ${worker.nationality || ""} ${placement.contract?.clientName || worker.beneficiaryName || ""} ${placement.contract?.referenceCode || ""} ${placement.site}`.toLowerCase();
    return (
      (!workerQuery.trim() ||
        haystack.includes(workerQuery.trim().toLowerCase())) &&
      (workerStatus === "all" || worker.status === workerStatus)
    );
  });
  const totalRequired = operational.reduce((sum, row) => sum + row.required, 0);
  const totalAssigned = operational.reduce(
    (sum, row) => sum + row.active.length,
    0,
  );
  const available = workers.filter(
    (worker) => worker.status === "available" && !worker.archivedAt,
  ).length;

  return (
    <section className="workforce-supervision-workspace"><WorkerIncidentsPanel selectedIncidentId={selectedIncidentId}/>
      <header className="feature-heading">
        <div>
          <span>التشغيل الميداني المرتبط بالعقود</span>
          <h1>إدارة الإشراف على العمالة</h1>
          <p>
            إسناد العمال، إنهاء الإسناد، متابعة العجز، وإدارة الحالات التشغيلية
            مباشرة من مساحة واحدة وفق صلاحية المشرف.
          </p>
        </div>
        <b>{operational.length}<small>عقد قابل للإدارة</small></b>
      </header>
      <div className="supervision-kpis">
        <article><span>المطلوب</span><strong>{totalRequired}</strong></article>
        <article><span>المسند</span><strong>{totalAssigned}</strong></article>
        <article><span>العجز</span><strong>{operational.reduce((sum, row) => sum + row.shortage, 0)}</strong></article>
        <article><span>عمال متاحون</span><strong>{available}</strong></article>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>العقود ومواقع العمالة</h2>
            <p>
              افتح الإدارة المباشرة لإسناد العامل المطابق للمهنة والكفالة أو إنهاء
              إسناده مع حفظ التاريخ.
            </p>
          </div>
          <div className="supervision-filters">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالعميل أو العقد أو الموقع" />
            <select value={coverage} onChange={(event) => setCoverage(event.target.value as typeof coverage)}>
              <option value="all">جميع العقود</option>
              <option value="shortage">عقود بها عجز</option>
              <option value="complete">تغطية مكتملة</option>
            </select>
          </div>
        </div>
        <div className="feature-list supervision-contracts">
          {filtered.map((row) => {
            const { contract, requirements, required, active, assignedWorkers, shortage, percent } = row;
            const expanded = expandedContractId === contract.id;
            return (
              <article key={contract.id} className={expanded ? "expanded" : ""}>
                <div className="supervision-contract-main">
                  <header>
                    <div>
                      <strong>{contract.referenceCode} · {contract.clientName}</strong>
                      <small>{contract.title} · {contract.workSite}</small>
                    </div>
                    <span className={`workflow-status ${contract.status}`}>{statusLabels[contract.status] || contract.status}</span>
                  </header>
                  <div className="coverage-meter">
                    <span><i style={{ width: `${percent}%` }} /></span>
                    <b>{contract.quantityMode === "open" ? `${active.length} · عدد مفتوح` : `${active.length}/${required} · ${percent}%`}</b>
                  </div>
                  <div className="profession-coverage">
                    {requirements.map((item) => {
                      const count = active.filter(
                        (assignment) => assignment.contractProfessionId === item.id,
                      ).length;
                      const matchingAvailable = workers.filter(
                        (worker) =>
                          !worker.archivedAt && worker.status === "available" &&
                          worker.profession === item.profession &&
                          sponsorshipMatches(worker, item),
                      ).length;
                      return (
                        <span key={item.id} className={count < item.requiredCount ? "shortage" : "complete"}>
                          <strong>{item.profession}</strong>{count}/{item.requiredCount}<small>متاح {matchingAvailable}</small>
                        </span>
                      );
                    })}
                  </div>
                  {assignedWorkers.length > 0 && (
                    <small>المسندون: {assignedWorkers.map((worker) => worker.fullName).join("، ")}</small>
                  )}
                </div>
                <aside>
                  <b className={shortage ? "has-shortage" : "complete"}>{shortage ? `عجز ${shortage}` : "مكتمل"}</b>
                  <small>{contract.startDate} — {contract.endDate}</small>
                  {canManage && (
                    <button type="button" onClick={() => setExpandedContractId(expanded ? null : contract.id)}>
                      {expanded ? "إغلاق الإدارة المباشرة" : "إدارة العمال مباشرة"}
                    </button>
                  )}
                  <button className="admin-primary" type="button" onClick={() => onOpenContract(contract.id)}>
                    إدارة العمالة والغياب
                  </button>
                </aside>
                {expanded && (
                  <div className="supervision-direct-management">
                    {requirements.map((profession) => {
                      const professionAssignments = active.filter(
                        (assignment) => assignment.contractProfessionId === profession.id,
                      );
                      const assignedIds = new Set(professionAssignments.map((assignment) => assignment.workerId));
                      const candidates = workers.filter(
                        (worker) =>
                          !worker.archivedAt &&
                          !worker.archivedAt && worker.status === "available" &&
                          worker.profession === profession.profession &&
                          sponsorshipMatches(worker, profession) &&
                          !assignedIds.has(worker.id),
                      );
                      const remaining = Math.max(0, profession.requiredCount - professionAssignments.length);
                      return (
                        <section key={profession.id}>
                          <header>
                            <div><strong>{profession.profession}</strong><small>التغطية {professionAssignments.length}/{profession.requiredCount}</small></div>
                            <span className={remaining ? "has-shortage" : "complete"}>{remaining ? `متبقٍ ${remaining}` : "مكتمل"}</span>
                          </header>
                          <div className="supervision-assigned-workers">
                            {professionAssignments.map((assignment) => {
                              const worker = workers.find((item) => item.id === assignment.workerId);
                              return (
                                <article key={assignment.id}>
                                  <div><strong>{worker?.fullName || `عامل ${assignment.workerId}`}</strong><small>{worker?.workerNumber || "—"} · {worker?.iqamaNumber || "دون رقم إقامة"}</small></div>
                                  <button className="danger-action" disabled={busy === `contract-release-${assignment.id}`} onClick={() => void onRelease(contract.id, assignment.id)}>
                                    {busy === `contract-release-${assignment.id}` ? "جارٍ الإنهاء..." : "إنهاء الإسناد"}
                                  </button>
                                </article>
                              );
                            })}
                            {!professionAssignments.length && <p>لا يوجد عامل مسند لهذه المهنة.</p>}
                          </div>
                          {contract.status === "active" && (contract.quantityMode === "open" || remaining > 0) && (
                            <div className="supervision-assign-control">
                              <select value={choices[profession.id] || ""} onChange={(event) => setChoices((current) => ({ ...current, [profession.id]: event.target.value }))}>
                                <option value="">اختر عاملًا مطابقًا</option>
                                {candidates.map((worker) => <option value={worker.id} key={worker.id}>{worker.fullName} — {worker.workerNumber || worker.iqamaNumber} — {worker.nationality}</option>)}
                              </select>
                              <button className="admin-primary" disabled={!choices[profession.id] || busy === `contract-assign-${profession.id}`} onClick={() => choices[profession.id] && void onAssign(contract.id, profession.id, Number(choices[profession.id])).then(() => setChoices((current) => ({ ...current, [profession.id]: "" })))}>
                                {busy === `contract-assign-${profession.id}` ? "جارٍ الإسناد..." : "إسناد العامل"}
                              </button>
                              {!candidates.length && <small>لا يوجد عامل متاح يطابق المهنة والكفالة.</small>}
                            </div>
                          )}
                          {contract.status !== "active" && remaining > 0 && <p className="readonly-note">يصبح الإسناد متاحًا بعد تحويل العقد إلى ساري.</p>}
                        </section>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
          {!filtered.length && <div className="empty-operational">لا توجد عقود مطابقة للبحث أو حالة التغطية.</div>}
        </div>
      </section>
      <section className="panel supervision-worker-pool">
        <div className="panel-head">
          <div><h2>قائمة العمال التشغيلية</h2><p>تغيير حالة العامل غير المسند بين متاح، إجازة، وموقوف دون المساس بسجله أو حركاته المالية.</p></div>
          <div className="supervision-filters">
            <input value={workerQuery} onChange={(event) => setWorkerQuery(event.target.value)} placeholder="بحث بالاسم أو الرقم أو المهنة" />
            <select value={workerStatus} onChange={(event) => setWorkerStatus(event.target.value)}>
              <option value="all">كل الحالات</option><option value="available">متاح</option><option value="assigned">مسند</option><option value="leave">إجازة</option><option value="suspended">موقوف</option>
            </select>
          </div>
        </div>
        <div className="supervision-worker-grid">
          {visibleWorkers.map((worker) => {
            const placement = resolveWorkerContractPlacement(worker.id, assignments, contracts, worker.clientSite);
            return (
              <article key={worker.id}>
                <div>
                  <strong>{worker.fullName}</strong>
                  <small>{worker.workerNumber || "—"} · {worker.iqamaNumber || "دون رقم إقامة"}</small>
                  <small>{worker.profession} · {worker.nationality || "—"}</small>
                  <small>{placement.contract ? `العقد ${placement.contract.referenceCode} · ${placement.contract.clientName}` : worker.beneficiaryName || "غير مسند"}</small>
                  <small>{placement.contract ? `موقع العمل من العقد: ${placement.site || "غير محدد"}` : `موقع العمل: ${placement.site || "غير محدد"}`}</small>
                </div>
                {canManage && worker.status !== "assigned" ? (
                  <select value={worker.status} disabled={busy === `worker-status-${worker.id}`} onChange={(event) => void onWorkerStatus(worker.id, event.target.value)}>
                    <option value="available">متاح</option><option value="leave">إجازة</option><option value="suspended">موقوف</option>
                  </select>
                ) : <span className={`workflow-status ${worker.status}`}>{workerStatusLabels[worker.status] || worker.status}</span>}
              </article>
            );
          })}
          {!visibleWorkers.length && <p className="empty-operational">لا توجد عمالة مطابقة.</p>}
        </div>
      </section>
    </section>
  );
}
