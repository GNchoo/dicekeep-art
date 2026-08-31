/* 캐주얼 킹덤러쉬/랜덤다이스 톤 — 아트팩 + 100스테이지 데이터 */
window.DKCONTENT = (function () {
  const maps = [
    { key: 'cMap1', src: 'casual/maps/map-01-meadow.jpg', name: '꽃초원' },
    { key: 'cMap2', src: 'casual/maps/map-02-candy.jpg', name: '사탕숲' },
    { key: 'cMap3', src: 'casual/maps/map-03-beach.jpg', name: '햇살해변' },
    { key: 'cMap4', src: 'casual/maps/map-04-snow.jpg', name: '눈마을' },
    { key: 'cMap5', src: 'casual/maps/map-05-autumn.jpg', name: '호박농장' },
    { key: 'cMap6', src: 'casual/maps/map-06-night.jpg', name: '달빛버섯' },
    { key: 'cMap7', src: 'casual/maps/map-07-volcano.jpg', name: '장난화산' },
    { key: 'cMap8', src: 'casual/maps/map-08-sakura.jpg', name: '벚꽃언덕' },
    { key: 'cMap9', src: 'casual/maps/map-09-desert.jpg', name: '오아시스' },
    { key: 'cMap10', src: 'casual/maps/map-10-bamboo.jpg', name: '대나무도장' },
    { key: 'cMap11', src: 'casual/maps/map-11-swamp.jpg', name: '연꽃늪' },
    { key: 'cMap12', src: 'casual/maps/map-12-crystal.jpg', name: '무지개광산' },
  ];
  const skin = (f, letter) => ({ key: `cT${f}${letter}`, src: `casual/towers/t${f}-${letter}.png` });
  const towerSkins = {
    1: [skin(1, 'a'), skin(1, 'b'), skin(1, 'c')],
    2: [skin(2, 'a'), skin(2, 'b'), skin(2, 'c')],
    3: [skin(3, 'a'), skin(3, 'b'), skin(3, 'c')],
    4: [skin(4, 'a'), skin(4, 'b'), skin(4, 'c')],
    5: [skin(5, 'a'), skin(5, 'b'), skin(5, 'c')],
    6: [skin(6, 'a'), skin(6, 'b'), skin(6, 'c')],
  };
  const bases = [
    { id: 'slime', name: '슬라임', hp: 28, speed: 50, gold: 5, dmg: 1, size: 40, move: 'ground', sprite: 'cSlime', src: 'casual/enemies/slime.png' },
    { id: 'shroom', name: '버섯돌이', hp: 36, speed: 42, gold: 6, dmg: 1, size: 44, move: 'ground', sprite: 'cShroom', src: 'casual/enemies/shroom.png' },
    { id: 'pig', name: '돼지산적', hp: 48, speed: 46, gold: 7, dmg: 1, size: 48, move: 'ground', sprite: 'cPig', src: 'casual/enemies/pig.png' },
    { id: 'chicken', name: '닭기사', hp: 40, speed: 62, gold: 7, dmg: 1, size: 46, move: 'ground', sprite: 'cChicken', src: 'casual/enemies/chicken.png' },
    { id: 'goblin', name: '고블린', hp: 34, speed: 70, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cGoblin', src: 'casual/enemies/goblin.png' },
    { id: 'sheep', name: '양기사', hp: 52, speed: 44, gold: 8, dmg: 1, size: 48, move: 'ground', sprite: 'cSheep', src: 'casual/enemies/sheep.png' },
    { id: 'cactus', name: '선인장카우보이', hp: 46, speed: 48, gold: 8, dmg: 1, size: 46, move: 'ground', sprite: 'cCactus', src: 'casual/enemies/cactus.png' },
    { id: 'fox', name: '여우도둑', hp: 32, speed: 78, gold: 9, dmg: 1, size: 44, move: 'ground', sprite: 'cFox', src: 'casual/enemies/fox.png' },
    { id: 'penguin', name: '펭귄눈뭉치', hp: 38, speed: 50, gold: 7, dmg: 1, size: 44, move: 'ground', sprite: 'cPenguin', src: 'casual/enemies/penguin.png' },
    { id: 'bee', name: '꿀벌창병', hp: 22, speed: 88, gold: 8, dmg: 1, size: 42, move: 'air', sprite: 'cBee', src: 'casual/enemies/bee.png' },
    { id: 'balloon', name: '풍선임프', hp: 30, speed: 64, gold: 9, dmg: 1, size: 50, move: 'air', sprite: 'cBalloon', src: 'casual/enemies/balloon.png' },
    { id: 'bat', name: '가방박쥐', hp: 26, speed: 96, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cBat', src: 'casual/enemies/bat.png' },
    { id: 'owl', name: '부엉이법사', hp: 34, speed: 72, gold: 10, dmg: 1, size: 48, move: 'air', sprite: 'cOwl', src: 'casual/enemies/owl.png' },
    { id: 'parrot', name: '연연앵무', hp: 28, speed: 84, gold: 9, dmg: 1, size: 46, move: 'air', sprite: 'cParrot', src: 'casual/enemies/parrot.png' },
    { id: 'mole', name: '두더지광부', hp: 44, speed: 54, gold: 8, dmg: 1, size: 44, move: 'burrow', sprite: 'cMole', src: 'casual/enemies/mole.png' },
    { id: 'worm', name: '모래벌레', hp: 55, speed: 40, gold: 10, dmg: 2, size: 50, move: 'burrow', sprite: 'cWorm', src: 'casual/enemies/worm.png' },
    { id: 'arma', name: '아르마딜로', hp: 70, speed: 38, gold: 11, dmg: 2, size: 48, move: 'burrow', sprite: 'cArma', src: 'casual/enemies/arma.png' },
    { id: 'beetle', name: '장수풍뎅이', hp: 60, speed: 42, gold: 10, dmg: 2, size: 46, move: 'burrow', sprite: 'cBeetle', src: 'casual/enemies/beetle.png' },
    { id: 'crab', name: '소라게', hp: 50, speed: 46, gold: 9, dmg: 1, size: 44, move: 'burrow', sprite: 'cCrab', src: 'casual/enemies/crab.png' },
  ];
  const bossBases = [
    { id: 'kingSlime', name: '슬라임왕', hp: 720, speed: 28, gold: 90, dmg: 4, size: 86, move: 'ground', sprite: 'cKingSlime', src: 'casual/bosses/king-slime.png' },
    { id: 'diceDragon', name: '주사위용', hp: 980, speed: 30, gold: 120, dmg: 5, size: 92, move: 'air', sprite: 'cDiceDragon', src: 'casual/bosses/dice-dragon.png' },
    { id: 'ogreChef', name: '주사위요리사', hp: 1100, speed: 24, gold: 130, dmg: 5, size: 90, move: 'ground', sprite: 'cOgreChef', src: 'casual/bosses/ogre-chef.png' },
    { id: 'pumpkinKing', name: '호박왕', hp: 880, speed: 26, gold: 110, dmg: 4, size: 88, move: 'ground', sprite: 'cPumpkinKing', src: 'casual/bosses/pumpkin-king.png' },
    { id: 'yeti', name: '주사위예티', hp: 1050, speed: 22, gold: 125, dmg: 5, size: 92, move: 'ground', sprite: 'cYeti', src: 'casual/bosses/yeti.png' },
    { id: 'candyGolem', name: '사탕골렘', hp: 1200, speed: 20, gold: 140, dmg: 5, size: 94, move: 'ground', sprite: 'cCandyGolem', src: 'casual/bosses/candy-golem.png' },
    { id: 'kraken', name: '해적크라켄', hp: 960, speed: 32, gold: 130, dmg: 5, size: 90, move: 'air', sprite: 'cKraken', src: 'casual/bosses/kraken.png' },
  ];
  const ADJ = ['꼬마','숲','사탕','해변','눈꽃','달빛','황금','그림자','불꽃','이슬','돌','바람','꿀','구름','별','호박','산호','이끼','진주','장난','민트','코코아','벚꽃','밤하늘','햇살'];
  const RANK = ['신병','정찰','순찰','특공','정예','대장','파수','약탈','유랑','친위'];
  const species = [];
  for (let i = 0; i < 500; i++) {
    const b = bases[i % bases.length];
    const name = ADJ[i % ADJ.length] + ' ' + b.name + ' ' + RANK[Math.floor(i / bases.length) % RANK.length];
    species.push({ id: i, name, base: b.id, hue: (i * 47) % 360, hpM: 1 + (i % 7) * 0.06, spM: 1 + (i % 5) * 0.04 });
  }
  const BOSS_TITLE = ['왕','대공','폭군','제왕','군주','대장','수호신','악당','전설','우두머리'];
  const bosses = [];
  for (let i = 0; i < 100; i++) {
    const b = bossBases[i % bossBases.length];
    bosses.push({
      id: i,
      name: ADJ[i % ADJ.length] + ' ' + b.name + ' ' + BOSS_TITLE[i % BOSS_TITLE.length],
      base: b.id,
      hue: (i * 33) % 360,
      hpM: 1 + i * 0.08,
    });
  }
  return { maps, towerSkins, bases, bossBases, species, bosses, mapCount: 50, stageCount: 100 };
})();
