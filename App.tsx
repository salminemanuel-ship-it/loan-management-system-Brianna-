import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "./api";
import Customers from "./components/Customers";
import Dashboard from "./components/Dashboard";
import FieldAssessment from "./components/FieldAssessment";
import GroupIdentification from "./components/GroupIdentification";
import GroupRegistration from "./components/GroupRegistration";
import Login from "./components/Login";
import PasswordChangeRequired from "./components/PasswordChangeRequired";
import ProfileSettings from "./components/ProfileSettings";
import MessageInbox from "./components/MessageInbox";
import CustomerPortal from "./components/CustomerPortal";
import CustomerGroupProfile from "./components/CustomerGroupProfile";
import CustomerRequests from "./components/CustomerRequests";
import CustomerRequestInbox from "./components/CustomerRequestInbox";
import ManagerWorkspace from "./components/ManagerWorkspace";
import WorkflowScreen from "./components/WorkflowScreens";
import { can, roleNames, type Permission } from "./permissions";
import type { LoginResult, User } from "./types";

type Screen =
  | "dashboard" | "customers" | "groups" | "applications" | "assessment"
  | "approvals" | "disbursement" | "repayments" | "reports" | "settings" | "adminLanguage" | "adminCredentials"
  | "adminAccounts" | "adminSignins" | "adminMessages" | "adminRequests" | "adminResets" | "adminZones" | "myAccount" | "customerRequests" | "oversight";

const pages: { id: Screen; label: string; title: string; text: string; needs: Permission }[] = [
  { id: "dashboard", label: "Dashboard", title: "Dashboard", text: "Welcome back. Here is what is happening today.", needs: "dashboard.view" },
  { id: "customers", label: "Customers", title: "Customers", text: "Manage and search customer records.", needs: "customers.view" },
  { id: "groups", label: "Groups", title: "Groups", text: "Identify a group, then register its members.", needs: "groups.manage" },
  { id: "applications", label: "Loan Applications", title: "Loan Applications", text: "Follow every application from start to finish.", needs: "applications.view" },
  { id: "assessment", label: "Assessment", title: "Loan Assessment", text: "Visit the applicant and work out what they can repay.", needs: "assessment.do" },
  { id: "approvals", label: "Approvals", title: "Loan Approvals", text: "Review and approve loan applications.", needs: "approvals.view" },
  { id: "disbursement", label: "Disbursement", title: "Disbursement", text: "", needs: "disbursement.view" },
  { id: "repayments", label: "Repayments", title: "Repayments", text: "Record payments and track balances.", needs: "repayments.view" },
  { id: "reports", label: "Reports", title: "Reports", text: "Create and view financial and portfolio reports.", needs: "reports.view" },
  { id: "settings", label: "Profile settings", title: "Profile settings", text: "Manage your account details and sign out.", needs: "account.settings" },
  { id: "adminLanguage", label: "Language", title: "Language preferences", text: "Choose the display language for this device.", needs: "settings.view" },
  { id: "adminCredentials", label: "Admin credentials", title: "Admin credentials", text: "Change the username and password used to sign in.", needs: "settings.view" },
  { id: "adminAccounts", label: "Account access", title: "Account access", text: "Lock or restore access for system users.", needs: "settings.view" },
  { id: "adminSignins", label: "Recent sign-ins", title: "Recent sign-ins", text: "Review successful sign-ins from the past hour.", needs: "settings.view" },
  { id: "adminMessages", label: "Messages & reminders", title: "Messages & reminders", text: "Send updates and repayment reminders.", needs: "messages.send" },
  { id: "adminRequests", label: "Staff requests", title: "Staff requests", text: "Review pending staff access requests.", needs: "settings.view" },
  { id: "adminResets", label: "Password requests", title: "Password requests", text: "Review requests for password help.", needs: "settings.view" },
  { id: "adminZones", label: "Zone supervisors", title: "Zone supervisors", text: "Assign each loan group zone to its responsible supervisor.", needs: "settings.view" },
  { id: "myAccount", label: "My account", title: "Customer portal", text: "Your BML account and support.", needs: "customer.portal" },
  { id: "customerRequests", label: "Customer requests", title: "Customer requests", text: "Review requests submitted by customers.", needs: "customer.requests" },
  { id: "oversight", label: "Team oversight", title: "Team oversight", text: "Lead supervisors and loan officers, and review their portfolio activity.", needs: "manager.view" },
];

// Small line icons, one per menu item
const iconPaths: Record<Screen, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  customers: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0z",
  groups: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0zM17 11a3 3 0 100-6M18 14a6 6 0 013 6h-3",
  applications: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  assessment: "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12l3 3 5-6",
  approvals: "M4 4h16v16H4zM8 12l3 3 5-6",
  disbursement: "M3 6h18v12H3zM12 9a3 3 0 100 6 3 3 0 000-6z",
  repayments: "M4 12a8 8 0 0114-5l2-2v6h-6l2-2a5 5 0 00-9 3M20 12a8 8 0 01-14 5l-2 2v-6h6l-2 2a5 5 0 009-3",
  reports: "M5 20V10M12 20V4M19 20v-7",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M16 7a2 2 0 100 .01M8 17a2 2 0 100 .01",
  adminLanguage: "M4 6h16M7 3v3m10-3v3M6 10h12M8 14h8M10 18h4",
  adminCredentials: "M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7zM9 12l2 2 4-4",
  adminAccounts: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0zM18 8h4M20 6v4",
  adminSignins: "M3 12a9 9 0 1018 0 9 9 0 00-18 0zM12 7v5l3 2",
  adminMessages: "M3 5h18v14H3zM3 7l9 6 9-6",
  adminRequests: "M4 4h16v16H4zM8 12l3 3 5-6",
  adminResets: "M12 3v4m0 0l-3-3m3 3l3-3M5 12a7 7 0 101.5-4.3M5 5v3h3",
  adminZones: "M3 7h18M6 3v4m12-4v4M5 7v14h14V7M8 11h3m2 0h3M8 15h3m2 0h3",
  myAccount: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0z",
  customerRequests: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  oversight: "M3 4h18v13H3zM8 21h8M12 17v4M7 9h3M7 13h6M15 9h3M15 13h3",
};

function Icon({ name }: { name: Screen }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [groupTab, setGroupTab] = useState<"identify" | "register">("identify");
  const [groupId, setGroupId] = useState<number | undefined>();
  const [customerLanguage, setCustomerLanguage] = useState<"en" | "sw">(() => localStorage.getItem("bml_customer_language") === "sw" ? "sw" : "en");
  const [appLanguage, setAppLanguage] = useState<"en" | "sw">(() => localStorage.getItem("bml_app_language") === "sw" ? "sw" : "en");
  const routeSegments = location.pathname.split("/").filter(Boolean);
  const authRoute = routeSegments.length === 1 && ["welcome", "login", "register"].includes(routeSegments[0])
    ? routeSegments[0]
    : location.pathname === "/" ? "welcome" : null;
  const customerSections = ["home", "profile", "settings", "loans", "register-group", "request-assessment", "request-loan", "report-performance", "requests", "offers", "requirements", "news", "about", "location"];
  const customerSection = routeSegments[0] === "account" && customerSections.includes(routeSegments[1]) ? routeSegments[1] : "home";
  const routeScreen = routeSegments[0] === "account"
    ? "myAccount"
    : pages.find((item) => item.id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`) === routeSegments[0])?.id;
  const screen: Screen = routeScreen ?? "dashboard";

  function navigateToScreen(nextScreen: Screen) {
    const path = nextScreen.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    navigate(`/${path}`);
  }

  function navigateToCustomerSection(section: string) {
    navigate(`/account/${customerSections.includes(section) ? section : "home"}`);
  }

  useEffect(() => {
    if (!user) return;
    const validCustomerRoute = routeSegments[0] === "account"
      && routeSegments.length === 2
      && customerSections.includes(routeSegments[1]);
    const validStaffRoute = routeSegments.length === 1 && pages.some((item) =>
      item.id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`) === routeSegments[0]
    );

    if (user.role === "customer" && !validCustomerRoute) {
      navigate("/account/home", { replace: true });
    } else if (user.role !== "customer" && !validStaffRoute) {
      navigate(user.role === "management" ? "/oversight" : "/dashboard", { replace: true });
    }
  }, [user, location.pathname]);

  useEffect(() => {
    if (restoring || user) return;
    if (location.pathname === "/") {
      navigate("/welcome", { replace: true });
    } else if (!authRoute) {
      navigate("/welcome", { replace: true });
    }
  }, [restoring, user, location.pathname, authRoute]);

  useEffect(() => {
    let active = true;
    getCurrentUser().then((current) => {
      if (!active) return;
      if (current) {
        setUser(current);
      }
      setRestoring(false);
    }).catch(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);

  function handleSignedIn(result: LoginResult) {
    if (result.token) sessionStorage.setItem("bml_token", result.token);
    setUser(result.user);
    navigate(result.user.role === "customer" ? "/account/home" : result.user.role === "management" ? "/oversight" : "/dashboard", { replace: true });
    setGroupTab("identify");
    setGroupId(undefined);
  }

  function handleSignOut() {
    void logout().catch(() => undefined);
    sessionStorage.removeItem("bml_token");
    setUser(null);
    navigate("/welcome", { replace: true });
  }

  function handlePasswordChanged() {
    setUser((current) => current ? { ...current, mustChangePassword: false } : current);
    navigate(user?.role === "customer" ? "/account/home" : user?.role === "management" ? "/oversight" : "/dashboard", { replace: true });
  }

  if (!user) {
    return (
      <div className="dark-page">
        {restoring ? <div className="auth-restore" role="status">Checking your BML session…</div>
          : <Login creatingAccount={authRoute === "register"} onModeChange={(mode) => navigate(mode ? "/register" : "/login")} onSignedIn={handleSignedIn} />}
      </div>
    );
  }

  if (user.mustChangePassword) return <PasswordChangeRequired username={user.username} onChanged={handlePasswordChanged} onSignOut={handleSignOut} />;

  const menu = pages.filter((p) => can(user.role, p.needs));
  const page = pages.find((p) => p.id === screen)!;
  const customerNav = customerLanguage === "en"
    ? [{ id: "home", label: "Home", icon: "⌂" }, { id: "profile", label: "Group profile", icon: "◉" }, { id: "settings", label: "Profile settings", icon: "⚙" }, { id: "loans", label: "Group loans", icon: "▤" }, { id: "register-group", label: "Register a group", icon: "G" }, { id: "request-assessment", label: "Request assessment", icon: "✓" }, { id: "request-loan", label: "Request a loan", icon: "+" }, { id: "report-performance", label: "Report member performance", icon: "↗" }, { id: "requests", label: "Group requests", icon: "▧" }, { id: "offers", label: "What BML offers", icon: "◈" }, { id: "requirements", label: "Loan requirements", icon: "✓" }, { id: "news", label: "BML news", icon: "▥" }, { id: "about", label: "About Brianna", icon: "B" }, { id: "location", label: "Find us", icon: "⌖" }]
    : [{ id: "home", label: "Mwanzo", icon: "⌂" }, { id: "profile", label: "Wasifu wa kikundi", icon: "◉" }, { id: "settings", label: "Mipangilio ya wasifu", icon: "⚙" }, { id: "loans", label: "Mikopo ya kikundi", icon: "▤" }, { id: "register-group", label: "Sajili kikundi", icon: "G" }, { id: "request-assessment", label: "Omba tathmini", icon: "✓" }, { id: "request-loan", label: "Omba mkopo", icon: "+" }, { id: "report-performance", label: "Ripoti utendaji wa mwanachama", icon: "↗" }, { id: "requests", label: "Maombi ya kikundi", icon: "▧" }, { id: "offers", label: "Huduma za BML", icon: "◈" }, { id: "requirements", label: "Mahitaji ya mkopo", icon: "✓" }, { id: "news", label: "Habari za BML", icon: "▥" }, { id: "about", label: "Kuhusu Brianna", icon: "B" }, { id: "location", label: "Mahali petu", icon: "⌖" }];
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  });

  function body() {
    if (!can(user!.role, page.needs)) {
      return <p className="note">Your role does not have access to this screen.</p>;
    }
    switch (screen) {
      case "dashboard":
        return <Dashboard user={user!} onNavigate={navigateToScreen} />;
      case "customers":
        return <Customers canAdd={can(user!.role, "customers.add")} />;
      case "groups":
        return (
          <>
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={groupTab === "identify"}
                className={groupTab === "identify" ? "tab tab-active" : "tab"}
                onClick={() => setGroupTab("identify")}>Identify a group</button>
              <button type="button" role="tab" aria-selected={groupTab === "register"}
                className={groupTab === "register" ? "tab tab-active" : "tab"}
                onClick={() => setGroupTab("register")}>Register members</button>
            </div>
            {groupTab === "identify" ? (
              <GroupIdentification
                onContinue={(id) => {
                  setGroupId(id);
                  setGroupTab("register");
                }}
              />
            ) : (
              <GroupRegistration key={groupId ?? "none"} initialGroupId={groupId} />
            )}
          </>
        );
      case "assessment":
        return <FieldAssessment />;
      case "applications":
      case "approvals":
      case "disbursement":
      case "repayments":
        return <WorkflowScreen screen={screen} role={user!.role} username={user!.username} user={user!}
          onProfileChange={(changes) => setUser((current) => current ? { ...current, ...changes } : current)}
          language={appLanguage}
          onLanguageChange={(language) => { setAppLanguage(language); localStorage.setItem("bml_app_language", language); }} />;
      case "reports":
        return <p className="note">Reports are not available in this build.</p>;
      case "settings":
        return <ProfileSettings user={user!} onProfileChange={(changes) => setUser((current) => current ? { ...current, ...changes } : current)} onSignOut={handleSignOut} />;
      case "adminLanguage":
      case "adminCredentials":
      case "adminAccounts":
      case "adminSignins":
      case "adminMessages":
      case "adminRequests":
      case "adminResets":
      case "adminZones":
        return <WorkflowScreen screen={screen} role={user!.role} username={user!.username} user={user!}
          onProfileChange={(changes) => setUser((current) => current ? { ...current, ...changes } : current)}
          language={appLanguage}
          onLanguageChange={(language) => { setAppLanguage(language); localStorage.setItem("bml_app_language", language); }} />;
      case "myAccount":
        return customerSection === "settings"
          ? <ProfileSettings user={user!} onProfileChange={(changes) => setUser((current) => current ? { ...current, ...changes } : current)} onSignOut={handleSignOut} />
          : customerSection === "profile"
          ? <CustomerGroupProfile onNavigate={navigateToCustomerSection} />
          : ["request-loan", "register-group", "request-assessment", "report-performance", "requests"].includes(customerSection)
            ? <CustomerRequests section={customerSection} language={customerLanguage} registeredPhone={user!.phone ?? user!.username} onNavigate={navigateToCustomerSection} />
          : <CustomerPortal username={user!.username} profileImage={user!.profileImage} language={customerLanguage} section={customerSection} onNavigate={navigateToCustomerSection} onProfileImage={(profileImage) => setUser((current) => current ? { ...current, profileImage } : current)} />;
      case "customerRequests":
        return <CustomerRequestInbox role={user!.role} />;
      case "oversight":
        return <ManagerWorkspace />;
      default:
        return <p className="note">This screen is not built yet. It comes in a later step.</p>;
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <img className="logo-mark" src="/assets/brianna-logo.png" alt="Brianna Microfinance logo" />
          <span className="logo-text">BRIANNA<small>MICROFINANCE LTD</small></span>
        </div>
        <nav aria-label="Main" className="side-nav">
          {user.role === "customer" ? <>
            <span className="side-group-label">{customerLanguage === "en" ? "ACCOUNT" : "AKAUNTI"}</span>
            {customerNav.slice(0, 3).map((item) => <button key={item.id} type="button" className={customerSection === item.id ? "side-link side-link-active" : "side-link"} aria-current={customerSection === item.id ? "page" : undefined} onClick={() => navigateToCustomerSection(item.id)}><span className="customer-nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</button>)}
            <span className="side-group-label">{customerLanguage === "en" ? "REQUESTS" : "MAOMBI"}</span>
            {customerNav.slice(3, 8).map((item) => <button key={item.id} type="button" className={customerSection === item.id ? "side-link side-link-active" : "side-link"} aria-current={customerSection === item.id ? "page" : undefined} onClick={() => navigateToCustomerSection(item.id)}><span className="customer-nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</button>)}
            <span className="side-group-label">{customerLanguage === "en" ? "BML INFORMATION" : "TAARIFA ZA BML"}</span>
            {customerNav.slice(8).map((item) => <button key={item.id} type="button" className={customerSection === item.id ? "side-link side-link-active" : "side-link"} aria-current={customerSection === item.id ? "page" : undefined} onClick={() => navigateToCustomerSection(item.id)}><span className="customer-nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</button>)}
          </> : menu.map((p) => (
            <button
              key={p.id}
              type="button"
              className={screen === p.id ? "side-link side-link-active" : "side-link"}
              aria-current={screen === p.id ? "page" : undefined}
              onClick={() => navigateToScreen(p.id)}
            >
              <Icon name={p.id} />
              {p.label}
            </button>
          ))}
        </nav>
        {user.role === "customer" && <label className="sidebar-language"><span>{customerLanguage === "en" ? "Language" : "Lugha"}</span><select value={customerLanguage} onChange={(e) => { const value = e.target.value as "en" | "sw"; setCustomerLanguage(value); localStorage.setItem("bml_customer_language", value); }}><option value="en">English</option><option value="sw">Kiswahili</option></select></label>}
        <div className="side-foot">
          <span className={user.profileImage ? "avatar avatar-image" : "avatar"} aria-hidden="true">{user.profileImage ? <img src={user.profileImage} alt="" /> : (user.fullName ?? user.username).charAt(0).toUpperCase()}</span>
          <span>{user.fullName ?? user.username}<small><i className="online" /> {roleNames[user.role]}</small></span>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <span className="topbar-name">Brianna Microfinance Limited</span>
          <div className="topbar-user">
            <MessageInbox />
            <span className={user.profileImage ? "avatar avatar-image" : "avatar"} aria-hidden="true">{user.profileImage ? <img src={user.profileImage} alt="" /> : (user.fullName ?? user.username).charAt(0).toUpperCase()}</span>
            <span className="who">
              {user.fullName ?? user.username}
              <small>{roleNames[user.role]}</small>
            </span>
          </div>
        </header>

        <main className="page">
          {!(["disbursement", "repayments"] as Screen[]).includes(screen) && <div className="page-title">
            <div>
              <h1>{user.role === "customer" ? customerNav.find((item) => item.id === customerSection)?.label : page.title}</h1>
              {(user.role === "customer" || page.text) && <p>{user.role === "customer" ? (customerLanguage === "en" ? "Brianna services and information for customers." : "Huduma na taarifa za Brianna kwa wateja.") : page.text}</p>}
            </div>
            {screen === "dashboard" && <span className="date-chip">{today}</span>}
          </div>}
          {body()}
        </main>
      </div>
    </div>
  );
}
