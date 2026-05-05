import { ShieldCheck } from 'lucide-react';

type StatusCardProps = {
  title: string;
  description: string;
};

export function StatusCard({ title, description }: StatusCardProps) {
  return (
    <section className="status-card">
      <ShieldCheck aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
