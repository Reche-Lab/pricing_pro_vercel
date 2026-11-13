import React from "react";
import { GOOGLE_MAPS_TERMS, GOOGLE_PRIVACY } from "@/domain/commerce/google-reviews";
export function GoogleMapsNotice() {
  return <p>A exibição de avaliações utiliza o Google Maps, sujeito aos <a href={GOOGLE_MAPS_TERMS} target="_blank" rel="noopener noreferrer">Termos de Serviço adicionais do Google Maps</a> e à <a href={GOOGLE_PRIVACY} target="_blank" rel="noopener noreferrer">Política de Privacidade do Google</a>.</p>;
}
