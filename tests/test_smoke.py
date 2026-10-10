from assistant.rules import reply


def test_greeting():
    assert "Hello" in reply("hi")


def test_office_lookup():
    assert "I.101" in reply("Where is the Training Office?")


def test_unknown():
    assert "don't know" in reply("what is the meaning of life")


def test_empty():
    assert reply("   ") == "Please type a question."


def test_health_center_lookup():
    assert "A.105" in reply("Where is the Health Center?")


def test_international_office_lookup():
    assert "F.203" in reply("When does the International Office open?")
