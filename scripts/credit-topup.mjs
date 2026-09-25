import { adminClient, checked, uuid } from "../server/admin.js";
const [userId, amount, reference] = process.argv.slice(2);
if (
  !uuid(userId) ||
  !Number.isSafeInteger(Number(amount)) ||
  Number(amount) <= 0 ||
  !reference?.trim()
) {
  console.error(
    "Uso: node --env-file=.env.worker scripts/credit-topup.mjs UUID_CONTADOR CREDITOS REFERENCIA_PAGO",
  );
  process.exitCode = 1;
} else {
  try {
    const applied = checked(
      await adminClient().rpc("topup_credits", {
        p_user: userId,
        p_amount: Number(amount),
        p_reference: reference.trim(),
      }),
    );
    console.log(
      applied
        ? "Créditos acreditados."
        : "Este pago ya estaba acreditado. No se duplicó el saldo.",
    );
  } catch (err) {
    console.error("No se acreditó el saldo:", err.message);
    process.exitCode = 1;
  }
}
