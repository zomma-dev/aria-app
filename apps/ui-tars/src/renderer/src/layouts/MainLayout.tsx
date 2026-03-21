import type { CSSProperties } from 'react';
import { Outlet } from 'react-router';
import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import { SidebarInset, SidebarProvider } from '@renderer/components/ui/sidebar';

export function MainLayout() {
  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          '--sidebar-width': '22rem',
          '--sidebar-width-icon': '4.5rem',
        } as CSSProperties
      }
      className="zomma-shell flex min-h-screen w-full"
    >
      <AppSidebar />
      <SidebarInset className="min-h-screen flex-1 bg-transparent">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
