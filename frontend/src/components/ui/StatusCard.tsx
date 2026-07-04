type StatusCardProps = {
  title: string;
  value: string;
  tone?: "success" | "warning" | "error" | "info";
  detail: string;
};

export function StatusCard({ title, value, tone = "info", detail }: StatusCardProps) {
  const badgeClass = {
    success: "badge-success",
    warning: "badge-warning",
    error: "badge-error",
    info: "badge-info",
  }[tone];

  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="card-title text-base">{title}</h3>
          <span className={`badge ${badgeClass} badge-outline`}>{value}</span>
        </div>
        <p className="text-sm text-base-content/70">{detail}</p>
      </div>
    </div>
  );
}
