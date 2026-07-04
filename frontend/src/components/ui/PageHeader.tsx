type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">{eyebrow}</p>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-base-content sm:text-4xl">{title}</h1>
        <p className="max-w-3xl text-sm text-base-content/70 sm:text-base">{description}</p>
      </div>
    </div>
  );
}
