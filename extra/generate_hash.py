import bcrypt
import getpass
import os

def generate_bcrypt_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def export_to_file(content: str, filename: str = "hashed_password.txt") -> None:
    try:
        with open(filename, "w") as file:
            file.write(content + "\n")
        print(f"\n✅ Hash successfully saved to: {os.path.abspath(filename)}")
    except Exception as e:
        print(f"\n❌ Failed to save the file: {e}")

def main():
    print("🔐 Bcrypt Password Hash Generator\n")

    try:
        password = getpass.getpass("Enter the password you want to hash: ")
        if not password:
            print("⚠️ Password cannot be empty. Exiting.")
            return

        hashed_password = generate_bcrypt_hash(password)
        print("\n🔑 Your bcrypt hashed password:\n")
        print(hashed_password)

        choice = input("\n💾 Do you want to export this hash to a text file? (y/n): ").strip().lower()
        if choice == 'y':
            export_to_file(hashed_password)
        else:
            print("\n✅ No file created. You're all set!")

    except KeyboardInterrupt:
        print("\n⛔ Operation cancelled by user.")

if __name__ == "__main__":
    main()
