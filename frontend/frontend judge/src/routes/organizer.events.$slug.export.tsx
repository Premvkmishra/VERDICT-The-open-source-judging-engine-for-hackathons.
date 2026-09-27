import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { OrganizerGuard } from "@/components/organizer-guard";
import { OrganizerNav } from "@/components/organizer-nav";
import { PageHeading } from "@/components/state";
import { Button } from "@/components/ui/button";
import { buildUrl } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/organizer/events/$slug/export")({
  head: ({ params }) => ({
    meta: [
      { title: `Export — ${params.slug} — Verdict organizer` },
      { name: "description", content: `Download the ranked results for ${params.slug} as CSV.` },
      { property: "og:title", content: `Export — ${params.slug}` },
      { property: "og:description", content: `Download the ranked results for ${params.slug} as CSV.` },
    ],
  }),
  component: () => {
    const { slug } = Route.useParams();
    return (
      <OrganizerGuard slug={slug}>
        <ExportPage slug={slug} />
      </OrganizerGuard>
    );
  },
});

function ExportPage({ slug }: { slug: string }) {
  const [pending, setPending] = useState(false);
  const url = buildUrl(`/events/${slug}/export.csv`);

  async function download() {
    setPending(true);
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`The export failed (${response.status}).`);
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${slug}-results.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast.success("Export downloaded");
    } catch (error) {
      toast.error(errorMessage(error, "We couldn't download the export."));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12">
      <PageHeading
        eyebrow="Organizer"
        title="Export results"
        description="A CSV of the latest ranked results, ready for spreadsheets and announcements."
      />
      <OrganizerNav slug={slug} className="mt-6" />

      <section className="panel mt-8 flex flex-wrap items-center justify-between gap-5 p-8">
        <div>
          <h2 className="font-display text-2xl">Ranked results CSV</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Includes rank, display score, review counts and tie-break reasons.
          </p>
        </div>
        <Button size="lg" onClick={() => void download()} disabled={pending}>
          <Download className="mr-2 h-4 w-4" />
          {pending ? "Preparing…" : "Download CSV"}
        </Button>
      </section>
    </main>
  );
}
