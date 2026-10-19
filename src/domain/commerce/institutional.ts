export type StoreInstitutionalPage = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  highlights: string[];
  sections: { id: string; title: string; paragraphs: string[]; items?: string[] }[];
  questions: { question: string; answer: string }[];
};

export const INSTITUTIONAL_UPDATED = "2026-10-19";
export const GROUND_SHOP_IDENTITY = {
  legalName: "38.265.820 DANILO FRANK",
  document: "38.265.820/0001-88",
  address: "Rua Doutor Othon dos Santos Mercadante, 203, São José dos Campos - SP"
};

const pages: StoreInstitutionalPage[] = [
  {
    slug: "quem-somos", title: "Quem somos",
    description: "Conheça a Ground Shop: uma empresa familiar que cria bottons personalizados desde 2010, com atendimento próximo e envio para todo o Brasil.",
    intro: "Seu momento merece uma criação que tenha a sua cara.",
    highlights: ["Empresa familiar desde 2010", "Personalização com cuidado", "Envio para todo o Brasil"],
    sections: [
      { id: "nossa-historia", title: "Uma história feita de momentos", paragraphs: ["Somos uma empresa familiar que produz bottons personalizados desde 2010. Transformamos ideias em peças que acompanham encontros, representam marcas e ajudam a contar histórias."] },
      { id: "para-quem-criamos", title: "Da sua ideia ao seu acontecimento", paragraphs: ["Atendemos empresas, campanhas, eventos, indústria, comércio e serviços. Cada pedido recebe atenção à proposta, à arte e ao resultado que você quer levar para o seu público."] },
      { id: "feito-com-voce", title: "Personalizar também é participar", paragraphs: ["Na loja, você escolhe o produto e as quantidades, envia sua imagem e pode retocar, enquadrar e aprovar a arte. As guias do produto ajudam a posicionar textos e detalhes antes de concluir a personalização."] },
      { id: "nosso-cuidado", title: "Gente de verdade, perto de você", paragraphs: ["Oferecemos suporte durante a escolha e a preparação do pedido, com cuidado na produção e no envio. Quer conversar sobre uma ideia? Fale com a nossa equipe."] }
    ],
    questions: [
      { question: "Posso enviar minha própria arte?", answer: "Sim. Nos produtos personalizados, envie uma imagem e use o enquadramento para conferir como ela ficará no molde do produto." },
      { question: "Como encontro os produtos disponíveis?", answer: "Abra o catálogo para consultar os modelos, tamanhos, quantidades e condições de cada produto. O frete definitivo aparece no checkout." }
    ]
  },
  {
    slug: "termos-de-uso", title: "Termos de uso",
    description: "Entenda as regras de acesso, cadastro, envio de artes e uso da loja Ground Shop, com informações sobre pedidos e proteção de dados.",
    intro: "Regras claras para criar e comprar com tranquilidade.",
    highlights: ["Cadastro com dados corretos", "Respeito aos direitos de imagem", "Condições antes da compra"],
    sections: [
      { id: "acesso", title: "Acesso e conta", paragraphs: ["Você pode consultar a loja sem cadastro. Algumas funções exigem identificação. Informe dados corretos e atualizados e proteja os códigos de acesso recebidos por e-mail."] },
      { id: "artes", title: "Artes e conteúdo enviado", paragraphs: ["Envie apenas materiais que você tenha autorização para utilizar, respeitando direitos autorais, de imagem e de terceiros. Conteúdos ilícitos, ofensivos ou discriminatórios não são permitidos.", "Confira textos, cores, enquadramento e quantidades antes da aprovação. A aprovação não afasta a responsabilidade da loja por defeitos ou divergências na produção."] },
      { id: "compra", title: "Antes de concluir o pedido", paragraphs: ["Confira descrição, preço, personalização, frete e condições de compra apresentados na loja. As políticas de troca e reembolso complementam estas informações, sem restringir direitos assegurados pela legislação."] },
      { id: "propriedade", title: "Marca, privacidade e serviços externos", paragraphs: ["O acesso não transfere direitos sobre a marca ou os conteúdos da Ground Shop. Consulte a Política de Privacidade para entender o tratamento de dados. Links externos possuem condições próprias."] },
      { id: "atualizacoes", title: "Atualizações e contato", paragraphs: ["Mudanças relevantes serão informadas nos canais disponíveis. Atualizações não afastam condições já contratadas nem direitos legais. Em caso de dúvida, entre em contato antes de concluir a compra."] }
    ],
    questions: [{ question: "Onde encontro as condições específicas do meu pedido?", answer: "Na página do produto, no checkout e no registro do pedido. Guarde as informações da compra e as comunicações com a loja." }]
  },
  {
    slug: "politica-de-reembolso", title: "Política de reembolso",
    description: "Saiba como solicitar um reembolso à Ground Shop, quais informações enviar e como acompanhar a devolução e o estorno da sua compra.",
    intro: "Se algo não saiu como esperado, vamos entender o que aconteceu.",
    highlights: ["Atendimento pelo número do pedido", "Orientação para devolução", "Estorno acompanhado pela equipe"],
    sections: [
      { id: "solicitar", title: "Como solicitar", paragraphs: ["Entre em contato por e-mail com nome completo, número do pedido e motivo. Se houver defeito ou divergência, fotos ou vídeos ajudam a equipe a entender o problema; não substituem seus direitos de reclamação."] },
      { id: "devolucao", title: "Quando é necessário devolver", paragraphs: ["A equipe orientará a logística reversa, quando aplicável. Aguarde as instruções e o endereço confirmado antes de postar. Proteja as peças com uma embalagem adequada, reaproveitando a original quando possível."] },
      { id: "estorno", title: "Como acontece o reembolso", paragraphs: ["O estorno utiliza o meio de pagamento da compra, sem taxa adicional de reembolso. A confirmação e a forma de acompanhamento serão informadas no atendimento. O prazo de visualização pode depender da operadora ou instituição financeira, sem afastar os prazos legais."] },
      { id: "direitos", title: "Arrependimento e defeitos são situações diferentes", paragraphs: ["No arrependimento previsto no art. 49 do Código de Defesa do Consumidor, a restituição dos valores pagos é imediata. Defeitos têm regras próprias de garantia e solução; não se confundem com o prazo de arrependimento. Consulte também a Política de Troca e Devolução."] }
    ],
    questions: [{ question: "Preciso enviar o produto sem falar com a loja?", answer: "Fale primeiro com a equipe para receber as orientações de postagem e acompanhar sua solicitação. O contato não impede o exercício de direitos dentro dos prazos legais." }]
  },
  {
    slug: "politica-de-troca", title: "Política de Troca e Devolução",
    description: "Veja como solicitar trocas e devoluções na Ground Shop, comunicar defeitos e receber orientações sobre produtos personalizados e logística reversa.",
    intro: "Um caminho simples para resolver trocas, devoluções e imprevistos.",
    highlights: ["Informe o número do pedido", "Descreva o que aconteceu", "Receba as instruções de envio"],
    sections: [
      { id: "primeiro-passo", title: "Comece pelo atendimento", paragraphs: ["Envie nome, número do pedido e motivo por e-mail. Para problemas de fabricação, inclua uma descrição e, se possível, fotos ou vídeos. Nossa equipe orientará os próximos passos."] },
      { id: "arrependimento", title: "Desistência da compra", paragraphs: ["Para compras fora do estabelecimento, o art. 49 do Código de Defesa do Consumidor prevê arrependimento em até 7 dias da assinatura ou do recebimento. O pedido deve ser comunicado dentro do prazo aplicável."] },
      { id: "defeitos", title: "Defeitos e garantia", paragraphs: ["Defeitos não ficam limitados aos 7 dias de arrependimento. O art. 26 do CDC prevê 30 dias para reclamar de vícios aparentes em produtos não duráveis e 90 dias em duráveis. Em vícios ocultos, a contagem começa quando o problema se evidencia."] },
      { id: "personalizados", title: "Produtos personalizados", paragraphs: ["Fale com a equipe sobre pedidos com arte personalizada. A análise considera a solicitação e as condições do pedido, sem excluir automaticamente direitos legais ou a responsabilidade por defeitos e divergências."] },
      { id: "postagem", title: "Cuidados na postagem", paragraphs: ["Aguarde as instruções de logística reversa. Preserve o produto e acondicione-o com segurança. A embalagem original ajuda, mas sua ausência não elimina, por si só, garantias legais. Confirme o endereço com a equipe antes do envio."] }
    ],
    questions: [{ question: "Qual a diferença entre troca e reembolso?", answer: "A troca envolve a substituição do produto. O reembolso é a devolução dos valores. A solução depende da situação e dos direitos aplicáveis, e será informada durante o atendimento." }]
  },
  {
    slug: "politica-de-privacidade", title: "Política de Privacidade",
    description: "Conheça os dados utilizados pela Ground Shop, as finalidades do tratamento, os cuidados com artes enviadas e os canais para exercer seus direitos.",
    intro: "Seus dados fazem parte da sua confiança. Entenda como são utilizados.",
    highlights: ["Dados necessários à compra", "Artes usadas na personalização", "Um canal para seus direitos"],
    sections: [
      { id: "responsavel", title: "Quem é responsável", paragraphs: [`A Ground Shop é operada por ${GROUND_SHOP_IDENTITY.legalName}, CNPJ ${GROUND_SHOP_IDENTITY.document}, com sede em ${GROUND_SHOP_IDENTITY.address}. O atendimento da loja recebe dúvidas e solicitações sobre dados pessoais.`] },
      { id: "dados", title: "Dados e finalidades", paragraphs: ["Nome, e-mail, telefone, documento e endereço viabilizam conta, atendimento, pagamento, entrega e obrigações fiscais. Arquivos de arte e instruções permitem personalizar o pedido. Evite enviar dados pessoais desnecessários nas imagens."] },
      { id: "compartilhamento", title: "Compartilhamento e proteção", paragraphs: ["Dados necessários podem ser compartilhados com prestadores de pagamento, transporte, hospedagem e suporte à operação, inclusive no exterior. O tratamento observa as bases legais aplicáveis. Adotamos medidas de proteção; nenhum sistema oferece segurança absoluta."] },
      { id: "preferencias", title: "Sessão e preferências", paragraphs: ["A loja utiliza uma sessão para conta e carrinho e armazena a preferência de tema no navegador. Restringir esse armazenamento pode afetar essas funções. Serviços externos podem possuir políticas próprias."] },
      { id: "seus-direitos", title: "Seus direitos", paragraphs: ["Você pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento e demais direitos previstos na LGPD, incluindo revogação do consentimento e eliminação quando cabíveis. Podemos confirmar sua identidade e preservar registros exigidos por lei."] },
      { id: "atualizacoes", title: "Como falar sobre privacidade", paragraphs: ["Use o e-mail de contato da loja e identifique sua solicitação como privacidade. Mudanças relevantes nesta política serão comunicadas nos canais disponíveis."] }
    ],
    questions: [{ question: "Posso pedir a correção dos meus dados?", answer: "Sim. Entre em contato indicando o dado a corrigir. Para proteger sua conta, a equipe pode solicitar uma confirmação de identidade antes de atender ao pedido." }]
  }
];

export function storeInstitutionalPages(tenantSlug: string): readonly StoreInstitutionalPage[] {
  return tenantSlug === "ground-shop" ? pages : [];
}

export function storeInstitutionalPage(tenantSlug: string, path: string[]): StoreInstitutionalPage | undefined {
  return path.length === 1 ? storeInstitutionalPages(tenantSlug).find(page => page.slug === path[0]) : undefined;
}
