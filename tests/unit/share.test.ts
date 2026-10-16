import { describe, expect, it } from "vitest";
import { groupIndian, reminderMessage, shareAmount, summaryMessage, waLink } from "@/lib/share";

const link = "https://quits-go.vercel.app/g/abc123";

describe("AC-54: share and reminder text (R68–R70, D-22)", () => {
  it("groups digits the Indian way and uses ₹", () => {
    expect(groupIndian("1200")).toBe("1,200");
    expect(groupIndian("120000")).toBe("1,20,000");
    expect(groupIndian("12345678")).toBe("1,23,45,678");
    expect(groupIndian("999")).toBe("999");
    expect(shareAmount(120000)).toBe("₹1,200");
    expect(shareAmount(12000000)).toBe("₹1,20,000");
    expect(shareAmount(120050)).toBe("₹1,200.50");
    expect(shareAmount(5)).toBe("₹0.05");
  });

  it("builds the summary for two payments exactly", () => {
    expect(
      summaryMessage({
        groupName: "Flat 302",
        payments: [
          { from: "Rohan", to: "Aarav", amountMinor: 120000 },
          { from: "Sneha", to: "Priya", amountMinor: 12000000 },
        ],
        link,
      }),
    ).toBe("Quits: Flat 302\nPayments to settle up:\n- Rohan -> Aarav ₹1,200\n- Sneha -> Priya ₹1,20,000\nOpen the group: https://quits-go.vercel.app/g/abc123");
  });

  it("builds the settled-up summary exactly", () => {
    expect(summaryMessage({ groupName: "Goa Trip", payments: [], link })).toBe(
      "Quits: Goa Trip\nEveryone is settled up.\nOpen the group: https://quits-go.vercel.app/g/abc123",
    );
  });

  it("builds reminders for ₹1,20,000 and ₹1,200.50 exactly", () => {
    expect(reminderMessage({ from: "Rohan", to: "Aarav", amountMinor: 12000000, groupName: "Flat 302", link })).toBe(
      'Hi Rohan, a gentle reminder from Quits: please pay Aarav ₹1,20,000 for "Flat 302". You can scan the UPI QR in the group: https://quits-go.vercel.app/g/abc123 Thanks!',
    );
    expect(reminderMessage({ from: "Kabir", to: "Priya", amountMinor: 120050, groupName: "Goa Trip", link })).toBe(
      'Hi Kabir, a gentle reminder from Quits: please pay Priya ₹1,200.50 for "Goa Trip". You can scan the UPI QR in the group: https://quits-go.vercel.app/g/abc123 Thanks!',
    );
  });

  it("encodes the wa.me text (newline %0A, space %20, ₹ %E2%82%B9)", () => {
    const text = "Quits: A B\n- X -> Y ₹1,200";
    const url = waLink(text);
    expect(url).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
    expect(url).toBe("https://wa.me/?text=Quits%3A%20A%20B%0A-%20X%20-%3E%20Y%20%E2%82%B91%2C200");
    expect(decodeURIComponent(url.split("text=")[1])).toBe(text);
  });

  it("uses the app's money format for non-INR groups", () => {
    expect(shareAmount(1250, "USD")).toBe("$12.50");
  });
});
