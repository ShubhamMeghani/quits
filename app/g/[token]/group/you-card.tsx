"use client";

import { useIdentity } from "@/app/_components/identity";
import { Button, Card } from "@/app/_components/ui";

/** R4: shows who this device is acting as; "Switch person" clears it and shows the picker. */
export function YouCard() {
  const { meMember, setMe } = useIdentity();
  return (
    <Card className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">On this device you are</p>
        <p className="truncate text-lg font-bold">{meMember?.name}</p>
      </div>
      <Button variant="secondary" onClick={() => setMe(null)}>
        Switch person
      </Button>
    </Card>
  );
}
