"use client";

import { useIdentity } from "@/app/_components/identity";
import { Avatar, Button, Card } from "@/app/_components/ui";

/** R4: shows who this device is acting as; "Switch person" clears it and shows the picker. */
export function YouCard() {
  const { meMember, setMe } = useIdentity();
  return (
    // Wraps on narrow phones: "Switch person" drops below instead of squeezing the label.
    <Card className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-[12rem] flex-1 items-center gap-3">
        {meMember && <Avatar id={meMember.id} name={meMember.name} />}
        <div className="min-w-0">
          <p className="text-sm text-muted">On this device you are</p>
          <p className="truncate text-lg font-bold">{meMember?.name}</p>
        </div>
      </div>
      <Button variant="secondary" onClick={() => setMe(null)} className="grow sm:grow-0">
        Switch person
      </Button>
    </Card>
  );
}
