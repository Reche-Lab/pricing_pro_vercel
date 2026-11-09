"use client";
import React from "react";
import { Printer } from "lucide-react";
import styles from "./institutional.module.css";

export function StoreConditionsPrintButton() {
  return <button type="button" className={styles.printButton} onClick={() => window.print()} title="Abre a impressão do navegador. Você também pode escolher Salvar como PDF."><Printer size={16} aria-hidden="true"/>Imprimir ou salvar em PDF</button>;
}
