//components/_shared/page-header.tsx
"use client";
interface PageHeaderProps {
title: string;
description?: string;
/** Slot optionnel à droite — boutons d'action, filtres rapides, etc. */
actions?: React.ReactNode;
}
/**

Bandeau de page réutilisable.
— Sticky en haut de la zone de contenu (le body est le conteneur de scroll).
— Sur mobile, il se colle juste sous la topbar (h ≈ 56px → top-14).
— Léger backdrop-blur pour un rendu propre quand le contenu passe dessous.

Usage :
<PageHeader

title="Clients"


description="Manage all agency clients."


actions={<button>Add client</button>}

/>
*/
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
return (
<div className="sticky top-14 lg:top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-200">
 <div className="px-6 py-4 flex items-center justify-between gap-4">
{/* Titre + description */}
   <div className="min-w-0">
     <h1 className="text-xl font-bold text-gray-900 truncate">
       {title}
     </h1>
     {description && (
       <p className="text-sm text-gray-500 mt-0.5 truncate">
         {description}
       </p>
     )}
   </div>
{/* Actions (optionnel) */}
{actions && (
<div className="flex items-center gap-2 flex-shrink-0">
{actions}
</div>
)}
 </div>


</div>
);
}