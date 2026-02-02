"""
Script to populate the database with moradores (residents) data.
This script reads from contact list and creates moradores associated with their flats.
"""
import logging
import csv
import uuid
from typing import Optional

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Building, Flat, Morador

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Moradores data - extracted from contact list
# Format: building_name, flat_number, owner_name, mobile, email, car1, car2, car3
MORADORES_DATA = [
    ("Falcon", 1, "Roni Wine", "07946346589", "noga.wine@gmail.com", "", "", ""),
    ("Falcon", 2, "Anita Richman", "07831296710", "anita.richman21@gmail.com", "SW13BOU", "RV20 SKJ", ""),
    ("Falcon", 3, "Tim Kendall", "07889365272", "Tim2.kendall@virgin.net", "YV21CVZ", "YT67XVL", ""),
    ("Falcon", 4, "Renos Booth", "07869252944", "renos@syndex.co.uk", "SN18 OPC", "", ""),
    ("Falcon", 5, "llana Green", "07879406880", "llanagreen2003@yahoo.com", "", "", ""),
    ("Falcon", 6, "Jonathan Kaye", "07766111211", "jk@jk15.co.uk", "", "", ""),
    ("Falcon", 7, "Oliver Wignall", "07967873442", "oliverwignall@hotmail.com", "FJ64 BWK", "", ""),
    ("Falcon", 8, "Kunal S Mehta", "", "k.s.mehta@gmail.com", "LO23 XDD", "", ""),
    ("Falcon", 9, "Eiran", "07721639530", "", "", "", ""),
    ("Falcon", 10, "Elaine Hirth", "07808578348", "elainehirth@hotmail.com", "", "", ""),
    ("Falcon", 11, "Richard Aron", "27 72 191 7744", "richardaron06@aol.com", "WF22NJX", "REGO UDB", ""),
    ("Falcon", 12, "Marc Tendler", "07971787543", "gailmarc@msn.com", "LP16NWD", "", ""),
    ("Martlett", 2, "Stephen Hill", "07808 400284", "stephen@hill3.com", "", "", ""),
    ("Martlett", 3, "Stephanie Egerton", "07703 318 632", "biran.freeborn192@btinternet.com", "WU61 ZXK", "", ""),
    ("Martlett", 4, "Michael Young", "07815 557092", "michaelsbyoung@aol.com", "", "", ""),
    ("Martlett", 5, "Nicholas Dobrik", "07904981814", "nicholasdobrik59@gmail.com", "", "", ""),
    ("Martlett", 6, "Luiz Fernandes Headporter", "0207 431 6574", "oakhillporter@gmail.com", "", "", ""),
    ("Martlett", 7, "Nick Lane", "07809 341996", "nick.lane@ucl.ac.uk", "WD57 BZS", "", ""),
    ("Martlett", 8, "Gerry Samuels", "7769640747", "gerry@samuelsuk.co.uk", "", "", ""),
    ("Martlett", 9, "Aurelie Freeman", "07904 006546", "aurelie.freeman@gmail.com", "", "", ""),
    ("Martlett", 10, "Lopa Khan", "8801776194222", "lopa.kfrangipani@gmail.com", "", "", ""),
    ("Martlett", 11, "Nahid Alaghband-Mottahedan", "07919 272493", "marmba2000@yahoo.com", "LT68 YNV", "LX20 JVR", ""),
    ("Martlett", 12, "Kim Mendelowitz", "07799783998", "kmendelowitz@hotmail.com", "LL21AZW", "LN55PVD", ""),
    ("Martlett", 13, "A Starr", "07946 170109", "starrd123@gmail.com", "KN65 XSL", "", ""),
    ("Martlett", 15, "Shailaja Gidwani", "07801102557", "shailajagidwani@outlook.com", "EF68PNZ", "", ""),
    ("Martlett", 16, "Shiraz Moosajee", "07772445679", "shirazmoosajee@outlook.com", "HF57 CUK", "", ""),
    ("Merlin", 1, "Solveig Hill", "07711 080056", "solveig@solveighill.co.uk", "", "", ""),
    ("Merlin", 2, "Jonathan Gestetner", "07776136464", "jg@gestetner.net", "LL66MJV", "", "LL66MJV"),
    ("Merlin", 3, "Reiner Volhard", "020 7435 3747", "reiner.volhard@gmail.com", "RV09 YSD", "", ""),
    ("Merlin", 4, "Robert Cassen", "07718283040", "robertc2015@gmail.com", "", "", ""),
    ("Merlin", 5, "Jonathan Viljoen", "07794139187", "Jonathanjviljoen@gmail.com", "", "", ""),
    ("Merlin", 6, "Y Uda", "819057586208", "y-uda.evarich@nifty.com", "LB24 MYR", "LA70 NUK", "LA70 NUK"),
    ("Merlin", 7, "Vipul Chandna", "07980749205", "vipul_chandna@yahoo.com", "LF23NSG", "", ""),
    ("Merlin", 8, "Viacheslav Aleksanyan", "7912 162085", "viacheslav.aleksanyan@gmail.com", "", "", ""),
    ("Merlin", 9, "Jimmy Shamash", "07956090894", "Jimsham1@aol.com", "LK17NBO", "JOY 737", "LK 17 NBO"),
    ("Merlin", 10, "Merlin Piers", "07474 763937", "moraghgee@gmail.com", "", "", ""),
    ("Merlin", 11, "Valerie Cass", "07854752858", "valerie2121@icloud.com", "LO67 OR7", "LR66 WUX", ""),
    ("Northwood", 1, "David Birn", "07768846571", "d.birn@btinternet.com", "70 DJB", "LL67UGO", ""),
    ("Northwood", 1, "Sharon Caspi", "07743483087", "sharoncaspi1@gmail.com", "KD15BAV", "", ""),
    ("Northwood", 2, "Joy Tuffeild", "07824 140343", "joytuffield@gmail.com", "EK20 ZZV", "LT73 SZX", ""),
    ("Northwood", 3, "Horacio Furman", "07785326110", "horaciof46@gmail.com", "", "", ""),
    ("Northwood", 4, "Karthik Krishna", "07511448173", "krishnamurthy.karthik@gmail.com", "LG65NMO", "", ""),
    ("Northwood", 5, "Allan Chasan", "07802796886", "allan@starsmith.co.uk", "LT73UXA", "LK65OLN", ""),
    ("Northwood", 6, "M Slowe", "07801 912700", "", "", "", ""),
    ("Northwood", 7, "Erica Patricia McPeak", "07387362975", "", "", "", ""),
    ("Northwood", 8, "Jacqueline Cohen", "07768687064", "jackiercohen@hotmail.com", "EJ15GZV", "KCR 184l", ""),
    ("Northwood", 9, "Ikuko Pringle", "07771896127", "ikuko.pringle@gmail.com", "LT60EXC", "", ""),
    ("Northwood", 10, "S Mirfendereski", "07713 561412", "drsia@hotmail.com", "", "", ""),
    ("Northwood", 11, "Ali Nader Eshan Morshed", "44 7710537329", "nader.morshed@gmail.com", "KE24 UUX", "", ""),
    ("Northwood", 12, "Patricia Freedman", "0207 7943001", "patriciabenstead@aol.com", "", "", ""),
    ("Oak Lodge", 1, "Morpheus Assets LTD", "0207 7945053", "mariam@satrap.me", "SN10 CGS", "", ""),
    ("Oak Lodge", 2, "Jennifer Hirsch", "07801626061", "1jennyhirsch@gmail.co", "W100OJT", "LH64PAP", ""),
    ("Oak Lodge", 3, "Andre Bogaert", "07768778866", "andre@bogaert.uk", "00066", "", ""),
    ("Oak Lodge", 4, "Evan Feldman", "07305763723", "Larafeldman@yahoo.com", "LF19AXV", "LD21AKM", ""),
    ("Oak Lodge", 5, "Isabella Herdeis", "07932 186050", "isabella.herdeis@gmail.com", "", "", ""),
    ("Oak Lodge", 6, "Assaph Caspi", "07779083531", "office@casa-bella.co.uk", "LK23RUW", "", ""),
    ("Oak Lodge", 7, "A Patou", "07779443663", "avrilpa@btinternet.com", "", "", ""),
    ("Oak Lodge", 8, "Galia Fishman", "07814276820", "Galia.fishman@hotmail.com", "F15 JMF", "", ""),
    ("Oak Lodge", 9, "Anne Schneider", "07769706485", "anneschneiderhome@gmail.com", "", "", ""),
    ("Oak Lodge", 10, "F Scheinmann", "07711 090739", "feodorscheinmann@mac.com", "A4FEO", "", ""),
    ("Oak Lodge", 11, "Juan Gottard Piazza", "07960 034050", "jgpiazza@terra.com.br", "", "", ""),
    ("Oak Lodge", 12, "Diane Franks", "07768105015", "dianefranks@btinternet.com", "RV71 TVM", "", ""),
    ("Oak Lodge", 14, "Shiri Zarour", "07342095073", "shiri.fh@gmail.com", "", "", ""),
]


def populate_moradores() -> None:
    """Populate moradores from contact list data."""
    with Session(engine) as session:
        logger.info("Starting moradores population...")
        
        count = 0
        for building_name, flat_number, nome, mobile, email, car1, car2, car3 in MORADORES_DATA:
            # Find building
            building = session.exec(
                select(Building).where(Building.nome == building_name)
            ).first()
            
            if not building:
                logger.warning(f"Building '{building_name}' not found, skipping morador {nome}")
                continue
            
            # Find flat
            flat = session.exec(
                select(Flat).where(
                    (Flat.building_id == building.id) & 
                    (Flat.numero == flat_number)
                )
            ).first()
            
            if not flat:
                logger.warning(f"Flat {flat_number} in {building_name} not found, skipping morador {nome}")
                continue
            
            # Check if morador already exists
            existing = session.exec(
                select(Morador).where(
                    (Morador.flat_id == flat.id) & 
                    (Morador.nome == nome)
                )
            ).first()
            
            if existing:
                logger.info(f"Morador {nome} already exists in {building_name} {flat_number}, skipping")
                continue
            
            # Create morador
            morador = Morador(
                id=uuid.uuid4(),
                flat_id=flat.id,
                cargo=3,  # 3 = Proprietário (Owner)
                nome=nome,
                mobile=mobile or "",
                email=email,
                car1=car1,
                car2=car2,
                car3=car3,
            )
            session.add(morador)
            count += 1
            logger.info(f"Added morador: {nome} to {building_name} Flat {flat_number}")
        
        session.commit()
        logger.info(f"Successfully populated {count} moradores!")


if __name__ == "__main__":
    populate_moradores()
