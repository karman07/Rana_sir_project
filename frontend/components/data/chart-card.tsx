import { Card, CardBody, CardHeader } from "@/components/ui/card";

export function ChartCard({ title, description, action, children, height = 260 }: {
  title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; height?: number;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} action={action} />
      <CardBody>
        <div style={{ height }}>{children}</div>
      </CardBody>
    </Card>
  );
}
