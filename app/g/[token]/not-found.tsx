import { Empty } from "@/app/_components/ui";

export default function ItemNotFound() {
  return (
    <div className="py-6">
      <Empty title="Not found">This item may have been deleted, or the link is wrong.</Empty>
    </div>
  );
}
