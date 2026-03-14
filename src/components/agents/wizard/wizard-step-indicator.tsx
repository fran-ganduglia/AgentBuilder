type WizardStepIndicatorProps = {
  currentStep: number;
};

const STEPS = [
  "Workflow",
  "Instancia",
  "Integraciones",
  "Reglas",
  "Modelo",
  "Revision",
] as const;

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;

          return (
            <div key={label} className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isCompleted
                    ? "bg-emerald-600 text-white"
                    : isActive
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {stepNumber}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">Paso {stepNumber}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
