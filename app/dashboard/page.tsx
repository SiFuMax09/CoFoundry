import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listProjectsForUser } from "@/lib/projects";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { PlusIcon } from "@/components/icons";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const projects = listProjectsForUser(user.id);

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar email={user.email} />

      <main className="relative flex-1 overflow-y-auto px-8 py-12">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-center font-display text-3xl font-semibold text-ink">
            Deine Projekte
          </h1>

          {projects.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">
              Noch kein Projekt angelegt. Starte mit deinem ersten Vorhaben.
            </p>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        <div className="pointer-events-none sticky bottom-8 left-0 flex w-full justify-center">
          <Link
            href="/onboarding"
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-panel transition hover:bg-accent-strong"
          >
            <PlusIcon className="h-4 w-4" />
            Neues Projekt
          </Link>
        </div>
      </main>
    </div>
  );
}
