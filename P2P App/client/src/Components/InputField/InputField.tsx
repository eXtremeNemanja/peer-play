import React from "react";
import './InputField.css';

interface Props {
    value : any,
    onChange : any,
    type : string,
    label : string,
    id : string,
    required : boolean
}

const InputField = ({value, onChange, type, label, id, required} : Props) => {
    return (
        <div className="input-field">
            <label className="input-field-label" htmlFor={id}>{label}</label>
            { required ? 
                <input
                    type={type}
                    id={id}
                    value={value}
                    onChange={onChange}
                    required
                    className="input-field-input"
                /> 
                :
                <input
                    type={type}
                    id={id}
                    value={value}
                    onChange={onChange}
                />
            }
        </div>
    );
};

export default InputField;