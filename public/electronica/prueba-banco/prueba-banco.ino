// Praxiboscopic · prueba de banco de la electrónica de la mesa de dos tambores.
//
// Prueba cada parte por separado, en el orden del visor de conexiones (electronica.html): motores, sensores del bus
// I2C, sensor de marcas y destello del LED. No es el programa de la obra: no lee distancias ni sincroniza nada.
//
// Placa: «ESP32 Dev Module». Monitor serie a 115200 baudios, con fin de línea «Nueva línea».
// No usa bibliotecas aparte de Wire. Los pines son los mismos de src/elec/wiring.ts: una prueba del repositorio
// falla si dejan de coincidir.
#include <Wire.h>

const int PIN_PUL1 = 25;   // pasos del motor 1 (por Q1)
const int PIN_DIR1 = 26;   // sentido del motor 1 (por Q2)
const int PIN_PUL2 = 32;   // pasos del motor 2 (por Q3)
const int PIN_DIR2 = 33;   // sentido del motor 2 (por Q4)
const int PIN_LED = 27;    // LIN del IR2101: en alto, el LED enciende
const int PIN_MARCA = 34;  // salida DO del sensor de marcas F249 (solo entrada)
const int PIN_SDA = 21;
const int PIN_SCL = 22;
const int PIN_XSHUT2 = 4;  // XSHUT del sensor de mano 2

const long PULSOS_POR_VUELTA = 3200;  // DM542 en 1/16 de paso

const uint8_t DIR_MANO = 0x29;        // los dos sensores de mano nacen aquí
const uint8_t DIR_MANO_NUEVA = 0x2A;  // la que recibe el sensor de mano 1
const uint8_t DIR_AS5600 = 0x36;
const long LED_US_MAX = 500;          // ningún destello de prueba dura más

// --- bus I2C -----------------------------------------------------------------------------------------------------------
bool responde(uint8_t dir) {
  Wire.beginTransmission(dir);
  return Wire.endTransmission() == 0;
}

// registro de índice de 8 bits (VL53L0X, AS5600)
int leer8(uint8_t dir, uint8_t reg) {
  Wire.beginTransmission(dir);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)dir, 1) != 1) return -1;
  return Wire.read();
}

// registro de índice de 16 bits (VL53L4CD, VL53L1X)
int leer16(uint8_t dir, uint16_t reg) {
  Wire.beginTransmission(dir);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)(reg & 0xFF));
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)dir, 1) != 1) return -1;
  return Wire.read();
}

const char *nombre(uint8_t dir) {
  if (dir == DIR_MANO) return "sensor de mano";
  if (dir == DIR_MANO_NUEVA) return "sensor de mano 1, ya con su direccion nueva";
  if (dir == DIR_AS5600) return "encoder AS5600";
  return "desconocido";
}

void buscar() {
  int n = 0;
  for (uint8_t dir = 1; dir < 127; dir++) {
    if (!responde(dir)) continue;
    Serial.printf("  0x%02X  %s\n", dir, nombre(dir));
    n++;
  }
  if (n == 0) Serial.println("  Nada responde: revisa 3,3 V, tierra, y que SDA y SCL no esten cruzados.");
  else Serial.printf("  %d direccion(es).\n", n);
}

// Los dos sensores de mano nacen en 0x29. Se apaga el 2 por XSHUT, al 1 se le pasa a 0x2A y se enciende el 2.
// El cambio se pierde al quitar la corriente: el programa de la obra lo hace en cada arranque.
void direcciones() {
  pinMode(PIN_XSHUT2, OUTPUT);
  digitalWrite(PIN_XSHUT2, LOW);  // sensor de mano 2 apagado
  delay(10);
  if (responde(DIR_MANO_NUEVA)) {
    Serial.println("  El sensor de mano 1 ya estaba en 0x2A.");
  } else if (!responde(DIR_MANO)) {
    Serial.println("  Con el sensor 2 apagado nadie responde en 0x29: el sensor de mano 1 no esta en el bus.");
  } else {
    // el modelo se pregunta primero como VL53L0X: es una lectura y no altera a un VL53L4CD
    if (leer8(DIR_MANO, 0xC0) == 0xEE) {
      Serial.println("  Sensor de mano 1: VL53L0X.");
      Wire.beginTransmission(DIR_MANO);
      Wire.write(0x8A);
      Wire.write(DIR_MANO_NUEVA);
      Wire.endTransmission();
    } else {
      int id = leer16(DIR_MANO, 0x010F);
      if (id == 0xEB) Serial.println("  Sensor de mano 1: VL53L4CD.");
      else Serial.printf("  Sensor de mano 1: modelo 0x%02X, no es el esperado; se intenta igual.\n", id);
      Wire.beginTransmission(DIR_MANO);
      Wire.write(0x00);
      Wire.write(0x01);
      Wire.write(DIR_MANO_NUEVA);
      Wire.endTransmission();
    }
    delay(5);
  }
  pinMode(PIN_XSHUT2, INPUT);  // se suelta: la placa del sensor 2 lo vuelve a encender
  delay(10);
  bool uno = responde(DIR_MANO_NUEVA);
  bool dos = responde(DIR_MANO);
  Serial.printf("  Sensor de mano 1 en 0x2A: %s\n", uno ? "si" : "NO");
  Serial.printf("  Sensor de mano 2 en 0x29: %s\n", dos ? "si" : "NO");
  if (uno && !dos) Serial.println("  Falta el 2: o no esta conectado, o su XSHUT no llega al GPIO4 y cambio de direccion junto con el 1.");
  if (uno && dos) Serial.println("  Bien: dos sensores, dos direcciones.");
}

void angulo() {
  if (!responde(DIR_AS5600)) {
    Serial.println("  El AS5600 no responde en 0x36.");
    return;
  }
  Serial.println("  Gira el iman sobre el chip. Cualquier tecla para salir.");
  unsigned long fin = millis() + 20000;
  while (millis() < fin && !Serial.available()) {
    int estado = leer8(DIR_AS5600, 0x0B);
    int alto = leer8(DIR_AS5600, 0x0C);
    int bajo = leer8(DIR_AS5600, 0x0D);
    if (estado < 0 || alto < 0 || bajo < 0) {
      Serial.println("  Se perdio la lectura.");
      return;
    }
    int crudo = ((alto & 0x0F) << 8) | bajo;
    const char *iman = !(estado & 0x20) ? "sin iman" : (estado & 0x08) ? "iman demasiado cerca" : (estado & 0x10) ? "iman lejos" : "iman bien";
    Serial.printf("  %6.1f grados  (%4d de 4096)  %s\n", crudo * 360.0 / 4096.0, crudo, iman);
    delay(250);
  }
}

// --- sensor de marcas ----------------------------------------------------------------------------------------------------
void marcas() {
  // estas plaquitas (horquilla + LM393) dan nivel alto con el haz tapado y bajo con la ranura libre
  Serial.println("  Pasa una tarjeta o la orilla de la pelicula por la ranura. Cualquier tecla para salir.");
  int antes = digitalRead(PIN_MARCA);
  int cambios = 0;
  Serial.printf("  Ahora: %s (nivel %s)\n", antes ? "tapado" : "libre", antes ? "alto" : "bajo");
  unsigned long fin = millis() + 30000;
  while (millis() < fin && !Serial.available()) {
    int ahora = digitalRead(PIN_MARCA);
    if (ahora != antes) {
      cambios++;
      Serial.printf("  %s (nivel %s) · cambio %d\n", ahora ? "tapado" : "libre", ahora ? "alto" : "bajo", cambios);
      antes = ahora;
      delay(5);
    }
  }
  if (cambios == 0) Serial.println("  No cambio nunca: revisa VCC, GND y que DO llegue al GPIO34.");
}

// --- motores ---------------------------------------------------------------------------------------------------------
// una tanda de pulsos con rampa: arranca despacio, llega a la velocidad pedida y frena
void pulsos(int pinPul, long cuantos, float rpm) {
  float hz = rpm / 60.0f * PULSOS_POR_VUELTA;
  float hz0 = hz < 800.0f ? hz : 800.0f;
  long rampa = cuantos / 2 < 800 ? cuantos / 2 : 800;
  for (long k = 0; k < cuantos; k++) {
    long r = k < cuantos - 1 - k ? k : cuantos - 1 - k;
    float f = (r >= rampa || rampa == 0) ? hz : hz0 + (hz - hz0) * r / rampa;
    unsigned long periodo = (unsigned long)(1000000.0f / f);
    digitalWrite(pinPul, HIGH);
    delayMicroseconds(20);
    digitalWrite(pinPul, LOW);
    delayMicroseconds(periodo > 40 ? periodo - 20 : 20);
  }
}

void motor(int n, long rpm) {
  int pinPul = n == 1 ? PIN_PUL1 : PIN_PUL2;
  int pinDir = n == 1 ? PIN_DIR1 : PIN_DIR2;
  if (rpm <= 0) rpm = 30;
  if (rpm < 5) rpm = 5;
  if (rpm > 300) rpm = 300;
  Serial.printf("  Motor %d: una vuelta a %ld rpm...\n", n, rpm);
  digitalWrite(pinDir, HIGH);
  delayMicroseconds(100);
  pulsos(pinPul, PULSOS_POR_VUELTA, rpm);
  delay(500);
  Serial.println("  ...y de regreso.");
  digitalWrite(pinDir, LOW);
  delayMicroseconds(100);
  pulsos(pinPul, PULSOS_POR_VUELTA, rpm);
  Serial.println("  Listo. El eje debe quedar donde empezo.");
}

// --- LED ---------------------------------------------------------------------------------------------------------------
String linea(unsigned long esperaMs) {
  unsigned long fin = millis() + esperaMs;
  while (millis() < fin) {
    if (Serial.available()) {
      String s = Serial.readStringUntil('\n');
      s.trim();
      if (s.length()) return s;
    }
    delay(10);
  }
  return "";
}

// compuerta en alto 3 segundos, para medirla con el multimetro. Solo sin LED: con el, quedaria encendido fijo.
void compuerta() {
  Serial.println("  Esta prueba deja la compuerta del MOSFET en alto 3 segundos.");
  Serial.println("  El LED y los capacitores grandes NO deben estar conectados. Escribe s para seguir.");
  String r = linea(20000);
  if (r != "s" && r != "S") {
    Serial.println("  Cancelado.");
    return;
  }
  Serial.println("  Compuerta en alto: debe medir unos 12 V...");
  digitalWrite(PIN_LED, HIGH);
  delay(3000);
  digitalWrite(PIN_LED, LOW);
  Serial.println("  ...y en bajo: 0 V.");
}

void destellos(long us) {
  if (us <= 0) us = 100;
  if (us < 20) us = 20;
  if (us > LED_US_MAX) us = LED_US_MAX;
  Serial.printf("  72 destellos de %ld microsegundos, 24 por segundo. No mires el LED de frente.\n", us);
  const unsigned long periodo = 41667;  // 1/24 de segundo
  unsigned long t = micros();
  for (int k = 0; k < 72; k++) {
    digitalWrite(PIN_LED, HIGH);
    delayMicroseconds(us);
    digitalWrite(PIN_LED, LOW);
    t += periodo;
    long falta = (long)(t - micros());
    if (falta > 0) {
      delay(falta / 1000);
      delayMicroseconds(falta % 1000);
    }
  }
  digitalWrite(PIN_LED, LOW);
  Serial.println("  Listo.");
}

// --- menu ----------------------------------------------------------------------------------------------------------------
void ayuda() {
  Serial.println();
  Serial.println("Praxiboscopic · prueba de banco");
  Serial.println("  ?        esta lista");
  Serial.println("  1 [rpm]  motor 1: una vuelta y de regreso (30 rpm si no dices cuantas; hasta 300)");
  Serial.println("  2 [rpm]  motor 2: lo mismo");
  Serial.println("  i        busca lo que hay en el bus I2C");
  Serial.println("  d        da su direccion a cada sensor de mano");
  Serial.println("  a        lee el angulo del AS5600");
  Serial.println("  s        lee el sensor de marcas");
  Serial.println("  g        compuerta del MOSFET en alto 3 s (solo SIN el LED)");
  Serial.println("  l [us]   destellos del LED: 100 microsegundos si no dices cuantos; maximo 500");
  Serial.println();
}

void setup() {
  // lo primero: el LED apagado
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  for (int p : { PIN_PUL1, PIN_DIR1, PIN_PUL2, PIN_DIR2 }) {
    pinMode(p, OUTPUT);
    digitalWrite(p, LOW);
  }
  pinMode(PIN_MARCA, INPUT);
  pinMode(PIN_XSHUT2, INPUT);  // suelto: el sensor de mano 2 encendido
  Serial.begin(115200);
  Serial.setTimeout(50);
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);
  delay(300);
  ayuda();
}

void loop() {
  String s = linea(1000);
  if (!s.length()) return;
  char c = s[0];
  long n = s.length() > 1 ? s.substring(1).toInt() : 0;
  Serial.printf("> %s\n", s.c_str());
  switch (c) {
    case '?': ayuda(); break;
    case '1': motor(1, n); break;
    case '2': motor(2, n); break;
    case 'i': buscar(); break;
    case 'd': direcciones(); break;
    case 'a': angulo(); break;
    case 's': marcas(); break;
    case 'g': compuerta(); break;
    case 'l': destellos(n); break;
    default: Serial.println("  No conozco ese comando. Escribe ? para ver la lista."); break;
  }
  while (Serial.available()) Serial.read();  // lo que se haya tecleado durante la prueba
}
