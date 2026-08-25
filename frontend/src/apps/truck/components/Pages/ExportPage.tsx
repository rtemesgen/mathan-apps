import React from 'react';
import type { Owner, Transaction, Truck } from '../../types';
import { ExportDialog } from '../../../../components/ExportDialog';
import { buildTruckExportReports } from '../../truckExport';

interface ExportPageProps {
  trucks: Truck[];
  owners: Owner[];
  transactions: Transaction[];
  onBack: () => void;
  companyName?: string;
  reportId?: string;
  reportName?: string;
}

export const ExportPage: React.FC<ExportPageProps> = ({ trucks, owners, transactions, onBack, companyName = 'Company', reportId = 'complete-statement', reportName = 'Truck Financial Report' }) => {
  const reports = buildTruckExportReports({ trucks, owners, transactions });
  return (
  <ExportDialog
    open
    onClose={onBack}
    context={{ companyName, appName: 'Truck Equity', reportName, report: reports.find((item) => item.id === reportId) ?? reports[0], availableEntities: trucks.map(truck => ({ value: truck.id, label: `${truck.name} (${truck.unitNumber})` })) }}
  />
  );
};
