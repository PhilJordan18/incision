import type { Locale } from "./locale";

const copy = {
  fr: {
    rooms: "Mes salles", races: "Mes courses", roomHelp: "Retrouve la salle ouverte dont tu fais encore partie. Tu ne peux appartenir qu’à une salle à la fois.",
    returnRoom: "Retourner dans ma salle", noRoom: "Tu ne fais partie d’aucune salle ouverte.", unavailable: "Ta salle est indisponible pour le moment. Recharge cette page pour réessayer.",
    historyHelp: "Consulte tes courses terminées et leurs résultats privés, même lorsque la salle est fermée.", history: "Consulter mon historique",
    guide: "Les repères de ta traversée", intro: "Une salle pour pratiquer ensemble, un journal pour suivre tes progrès.",
    steps: [
      { title: "Rejoindre ou créer", body: "Entre un code, utilise ton invitation ou explore les salles publiques. Avec un compte, tu peux aussi créer une salle et ajouter des bots." },
      { title: "Entraînement ou Arcade", body: "L’entraînement se joue sans bonus. En Arcade, les joueurs en retard peuvent recevoir des bonus aux jalons : appuie sur Entrée pour activer un bonus reçu pendant la course." },
      { title: "Taper à ton rythme", body: "Après le décompte, tape le texte au clavier. Selon le réglage, corrige chaque erreur pour avancer ou continue en frappe libre. Ta vitesse et ta précision s’affichent en direct." },
      { title: "Lire tes résultats", body: "Compare les résultats, les courbes et tes caractères manqués. Avec un compte, retrouve la course dans ton historique. En invité, les résultats restent temporaires, sans historique personnel." },
    ],
  },
  en: {
    rooms: "My rooms", races: "My races", roomHelp: "Find the open room you still belong to. You can belong to only one room at a time.",
    returnRoom: "Return to my room", noRoom: "You do not belong to an open room.", unavailable: "Your room is unavailable right now. Reload this page to try again.",
    historyHelp: "View your completed races and private results, even after the room closes.", history: "View my history",
    guide: "Chart your course", intro: "A room to practise together, a log to follow your progress.",
    steps: [
      { title: "Join or create", body: "Enter a code, use your invitation or explore public rooms. With an account, you can also create a room and add bots." },
      { title: "Training or Arcade", body: "Training has no bonuses. In Arcade, trailing players may receive bonuses at milestones: press Enter to activate a received bonus during the race." },
      { title: "Type at your pace", body: "After the countdown, type the text on your keyboard. Depending on the setting, correct each mistake to advance or continue with free typing. Your speed and accuracy update live." },
      { title: "Read your results", body: "Compare results, charts and your missed characters. With an account, reopen the race from your history. Guest results are temporary, with no personal history." },
    ],
  },
};
export function journeyCopy(locale: Locale) { return copy[locale]; }
