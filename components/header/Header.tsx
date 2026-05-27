import UserMenu from './UserMenu';
import LanguageToggle from './LanguageToggle';

export default function Header() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-4 fixed top-0 left-64 right-0 z-20">
      <LanguageToggle />
      <UserMenu />
    </header>
  );
}
