import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import {
  listCompanies,
  setActiveOrganization,
  clearActiveOrganization,
} from "../services/organizationService";
import useInvoiceStore from "../store/invoiceStore";
import useUploadQueueStore from "../store/uploadQueueStore";
const Context = createContext(null);
export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const selectCompany = useCallback(
    (company) => {
      setActiveOrganization(company);
      useInvoiceStore.getState().reset();
      useUploadQueueStore.getState().reset();
      setActive(company);
      if (user?.id)
        localStorage.setItem("declarix:company:" + user.id, company?.id || "");
    },
    [user?.id],
  );
  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await listCompanies(user.id);
      setCompanies(data);
      const saved = localStorage.getItem("declarix:company:" + user.id);
      selectCompany(data.find((c) => c.id === saved && !c.archived) || null);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, selectCompany]);
  useEffect(() => {
    clearActiveOrganization();
    useInvoiceStore.getState().reset();
    useUploadQueueStore.getState().reset();
    setCompanies([]);
    setActive(null);
    if (!user) {
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    listCompanies(user.id)
      .then((data) => {
        if (!current) return;
        setCompanies(data);
        const saved = localStorage.getItem("declarix:company:" + user.id);
        selectCompany(data.find((c) => c.id === saved && !c.archived) || null);
        setError(null);
      })
      .catch((err) => {
        if (current) setError(err.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      clearActiveOrganization();
    };
  }, [user?.id, selectCompany]);
  return (
    <Context.Provider
      value={{
        companies,
        activeCompany,
        loading,
        error,
        refresh,
        selectCompany,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useCompany = () => useContext(Context);
